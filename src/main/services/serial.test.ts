import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { counters, documents } from '../db/schema'
import { openTestDb } from '../db/test-db'
import { ServiceError } from '@shared/errors'
import { formatSerial } from './serial'
import { createDocument, softDeleteDocument } from './documents'
import { createVessel, updateVessel } from './vessels'
import { sampleDocument } from './test-fixtures'

let db: Db

function vessel(name: string, prefix: string): number {
  return createVessel(db, { name, prefix, arrivalDate: null, isActive: true }).id
}

function issue(vesselId: number): string {
  return createDocument(db, sampleDocument(vesselId)).serialNo
}

function lastNumber(vesselId: number): number | undefined {
  return db.select().from(counters).where(eq(counters.vesselId, vesselId)).get()?.lastNumber
}

beforeEach(() => {
  db = openTestDb()
})

describe('formatSerial', () => {
  it('pads the number to 5 digits after the vessel letter', () => {
    expect(formatSerial('A', 1)).toBe('A00001')
    expect(formatSerial('A', 123)).toBe('A00123')
    expect(formatSerial('Z', 99999)).toBe('Z99999')
  })

  it('rejects numbers below 1 or not integers', () => {
    expect(() => formatSerial('A', 0)).toThrow()
    expect(() => formatSerial('A', 1.5)).toThrow()
  })
})

describe('serial numbers per vessel', () => {
  it('uses the vessel letter and starts each vessel at 00001', () => {
    const a = vessel('Vessel A', 'A')
    const b = vessel('Vessel B', 'B')
    expect([issue(a), issue(a), issue(b)]).toEqual(['A00001', 'A00002', 'B00001'])
  })

  it('lets two vessels with the same letter both issue A00001', () => {
    const first = vessel('First A', 'A')
    const second = vessel('Second A', 'A')
    expect(issue(first)).toBe('A00001')
    expect(issue(second)).toBe('A00001')
    const rows = db.select().from(documents).all()
    expect(rows.map((r) => [r.vesselId, r.number])).toEqual([
      [first, 1],
      [second, 1]
    ])
  })

  it('numbers each vessel sequentially when saves are interleaved', () => {
    const a = vessel('Vessel A', 'A')
    const b = vessel('Vessel B', 'B')
    const issued = [a, b, a, a, b].map(issue)
    expect(issued).toEqual(['A00001', 'B00001', 'A00002', 'A00003', 'B00002'])
  })

  it('never reuses a number after soft delete', () => {
    const a = vessel('Vessel A', 'A')
    issue(a)
    const second = createDocument(db, sampleDocument(a))
    issue(a)
    softDeleteDocument(db, second.id)
    expect(issue(a)).toBe('A00004')

    const deleted = db.select().from(documents).where(eq(documents.id, second.id)).get()!
    expect(deleted.serialNo).toBe('A00002')
    expect(deleted.deletedAt).not.toBeNull()
  })

  it('assigns the number in the same transaction as the insert', () => {
    const a = vessel('Vessel A', 'A')
    issue(a)
    // Make the document insert fail after the number has been taken.
    db.$client.exec(`
      CREATE TRIGGER fail_insert BEFORE INSERT ON documents
      WHEN NEW.shipper_name = 'FAIL' BEGIN SELECT RAISE(ABORT, 'forced failure'); END;
    `)
    expect(() => createDocument(db, sampleDocument(a, { shipperName: 'FAIL' }))).toThrow(
      'forced failure'
    )
    expect(lastNumber(a)).toBe(1)
    expect(issue(a)).toBe('A00002')
  })

  it('refuses a missing or inactive vessel without taking a number', () => {
    const a = vessel('Vessel A', 'A')
    updateVessel(db, a, { isActive: false })

    expect(() => createDocument(db, sampleDocument(a))).toThrow(ServiceError)
    expect(() => createDocument(db, sampleDocument(9999))).toThrow(ServiceError)
    expect(lastNumber(a)).toBeUndefined()
    expect(db.select().from(documents).all()).toHaveLength(0)
  })

  it('enforces uniqueness of (vessel, number) in the database', () => {
    const a = vessel('Vessel A', 'A')
    const doc = createDocument(db, sampleDocument(a))
    const copy = { ...doc, id: undefined }
    expect(() => db.insert(documents).values(copy).run()).toThrow(/UNIQUE/)
  })
})
