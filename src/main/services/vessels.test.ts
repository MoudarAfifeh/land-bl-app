import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { openTestDb } from '../db/test-db'
import { ServiceError } from '@shared/errors'
import { ZodError } from 'zod'
import { vessels } from '../db/schema'
import { createDocument, getDocument, softDeleteDocument } from './documents'
import {
  createVessel,
  getActiveVessel,
  listVessels,
  listVesselsWithCounts,
  setActiveVessel,
  updateVessel
} from './vessels'
import { sampleDocument } from './test-fixtures'

let db: Db

beforeEach(() => {
  db = openTestDb()
})

const input = { name: 'MT Test', prefix: 'a', arrivalDate: '2026-09-20', isActive: true }

describe('vessels', () => {
  it('stores the letter uppercase and validates it', () => {
    expect(createVessel(db, input).prefix).toBe('A')
    expect(() => createVessel(db, { ...input, prefix: 'AB' })).toThrow()
  })

  it('has no active vessel until one is set', () => {
    expect(getActiveVessel(db)).toBeNull()
  })

  it('sets the active vessel, optionally at creation', () => {
    const a = createVessel(db, input)
    const b = createVessel(db, { ...input, name: 'MT B', prefix: 'B' }, { makeActive: true })
    expect(getActiveVessel(db)?.id).toBe(b.id)
    setActiveVessel(db, a.id)
    expect(getActiveVessel(db)?.id).toBe(a.id)
  })

  it('refuses to make an inactive vessel the active one', () => {
    const a = createVessel(db, { ...input, isActive: false })
    expect(() => setActiveVessel(db, a.id)).toThrow(ServiceError)
  })

  it('clears the active vessel when it is deactivated', () => {
    const a = createVessel(db, input, { makeActive: true })
    updateVessel(db, a.id, { isActive: false })
    expect(getActiveVessel(db)).toBeNull()
  })

  it('lists only active vessels when asked', () => {
    createVessel(db, input)
    createVessel(db, { ...input, prefix: 'B', isActive: false })
    expect(listVessels(db)).toHaveLength(2)
    expect(listVessels(db, { activeOnly: true }).map((v) => v.prefix)).toEqual(['A'])
  })

  it('locks the letter once the vessel has documents', () => {
    const a = createVessel(db, input)
    expect(updateVessel(db, a.id, { prefix: 'C' }).prefix).toBe('C')
    createDocument(db, sampleDocument(a.id))
    expect(() => updateVessel(db, a.id, { prefix: 'D' })).toThrow(ServiceError)
    expect(updateVessel(db, a.id, { name: 'Renamed' }).name).toBe('Renamed')
  })

  it('still reads documents of an inactive vessel unchanged', () => {
    const a = createVessel(db, input)
    const created = createDocument(db, sampleDocument(a.id, { seals: ['S1', 'S2'] }))
    updateVessel(db, a.id, { isActive: false })

    const doc = getDocument(db, created.id)
    expect(doc.serialNo).toBe('A00001')
    expect(doc.seals).toEqual(['S1', 'S2'])
    expect(doc.vessel).toMatchObject({ id: a.id, prefix: 'A', isActive: false })
  })
})

describe('vessel list for settings', () => {
  it('counts documents, deleted ones too, and locks the letter once there is one', () => {
    const a = createVessel(db, input, { makeActive: true })
    const b = createVessel(db, { ...input, name: 'MT B', prefix: 'B', isActive: false })
    const doc = createDocument(db, sampleDocument(a.id))
    createDocument(db, sampleDocument(a.id))
    softDeleteDocument(db, doc.id)

    expect(listVesselsWithCounts(db)).toEqual([
      {
        id: a.id,
        name: 'MT Test',
        prefix: 'A',
        arrivalDate: '2026-09-20',
        isActive: true,
        isCurrent: true,
        documentCount: 2,
        lastSerial: 'A00002'
      },
      {
        id: b.id,
        name: 'MT B',
        prefix: 'B',
        arrivalDate: '2026-09-20',
        isActive: false,
        isCurrent: false,
        documentCount: 0,
        lastSerial: null
      }
    ])
  })
})

describe('blocked letters', () => {
  it('refuses O and I for a new vessel', () => {
    expect(() => createVessel(db, { ...input, prefix: 'o' })).toThrow(ZodError)
    expect(() => createVessel(db, { ...input, prefix: 'I' })).toThrow(ZodError)
    expect(listVessels(db)).toEqual([])
  })

  it('refuses changing a letter to O or I', () => {
    const a = createVessel(db, input)
    expect(() => updateVessel(db, a.id, { prefix: 'O' })).toThrow(ZodError)
    expect(listVessels(db)[0].prefix).toBe('A')
  })

  it('leaves a vessel that already has one untouched and editable', () => {
    const old = db.insert(vessels).values({ name: 'MT Old', prefix: 'O' }).returning().get()
    createDocument(db, sampleDocument(old.id))
    const renamed = updateVessel(db, old.id, { name: 'MT Old 2', isActive: false })
    expect(renamed).toMatchObject({ name: 'MT Old 2', prefix: 'O', isActive: false })
  })
})
