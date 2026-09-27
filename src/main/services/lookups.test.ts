import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { counters, documents } from '../db/schema'
import { openTestDb } from '../db/test-db'
import { ServiceError } from '@shared/errors'
import { ZodError } from 'zod'
import { createDocument, getDocumentView } from './documents'
import {
  createDriver,
  createParty,
  createTanker,
  deleteDriver,
  deleteParty,
  deleteTanker,
  listDrivers,
  listParties,
  listTankers,
  saveDriver,
  saveParty,
  saveTanker,
  updateDriver,
  updateParty,
  updateTanker
} from './lookups'
import { createVessel } from './vessels'
import { sampleDocument } from './test-fixtures'

let db: Db
let vesselId: number

beforeEach(() => {
  db = openTestDb()
  vesselId = createVessel(db, { name: 'MT A', prefix: 'A', arrivalDate: null, isActive: true }).id
})

describe('parties', () => {
  it('stores a new name trimmed with spaces collapsed', () => {
    saveParty(db, '  شركة   الحسن  ', ' دمشق ')
    expect(listParties(db)).toEqual([{ id: 1, name: 'شركة الحسن', address: 'دمشق' }])
  })

  it('does not duplicate a name that differs only by case or spaces', () => {
    saveParty(db, 'Al Hasan Co', 'Damascus')
    saveParty(db, ' al  HASAN co ', 'Damascus')
    expect(listParties(db)).toHaveLength(1)
    expect(listParties(db)[0].name).toBe('Al Hasan Co')
  })

  it('ignores a blank name', () => {
    saveParty(db, '   ', 'دمشق')
    expect(listParties(db)).toEqual([])
  })

  it('keeps a different stored address unless asked to update it', () => {
    saveParty(db, 'شركة الحسن', 'دمشق')
    saveParty(db, 'شركة الحسن', 'حمص')
    expect(listParties(db)[0].address).toBe('دمشق')
    saveParty(db, 'شركة الحسن', 'حمص', { updateStored: true })
    expect(listParties(db)[0].address).toBe('حمص')
  })

  it('fills a blank stored address but never clears one', () => {
    saveParty(db, 'شركة الحسن', null)
    saveParty(db, 'شركة الحسن', 'دمشق')
    expect(listParties(db)[0].address).toBe('دمشق')
    saveParty(db, 'شركة الحسن', '', { updateStored: true })
    expect(listParties(db)[0].address).toBe('دمشق')
  })
})

describe('drivers', () => {
  it('stores a new driver and matches existing names ignoring case and spaces', () => {
    saveDriver(db, ' Ahmad   Ali ', 'N123')
    saveDriver(db, 'ahmad ali', 'N123')
    expect(listDrivers(db)).toEqual([{ id: 1, name: 'Ahmad Ali', passportNo: 'N123' }])
  })

  it('keeps a different stored passport unless asked to update it', () => {
    saveDriver(db, 'أحمد علي', 'N123')
    saveDriver(db, 'أحمد علي', 'N999')
    expect(listDrivers(db)[0].passportNo).toBe('N123')
    saveDriver(db, 'أحمد علي', 'N999', { updateStored: true })
    expect(listDrivers(db)).toEqual([{ id: 1, name: 'أحمد علي', passportNo: 'N999' }])
  })

  it('fills a blank stored passport but never clears one', () => {
    saveDriver(db, 'أحمد علي', null)
    saveDriver(db, 'أحمد علي', 'N123')
    expect(listDrivers(db)[0].passportNo).toBe('N123')
    saveDriver(db, 'أحمد علي', null, { updateStored: true })
    expect(listDrivers(db)[0].passportNo).toBe('N123')
  })
})

describe('tankers', () => {
  it('stores a new tanker once, ignoring case and spaces', () => {
    saveTanker(db, ' 12345 ab ')
    saveTanker(db, '12345  AB')
    saveTanker(db, '')
    expect(listTankers(db)).toEqual([{ id: 1, tankerNo: '12345 ab' }])
  })
})

describe('saving a document fills the lookups', () => {
  it('saves new shipper, consignee, tanker and driver', () => {
    createDocument(
      db,
      sampleDocument(vesselId, {
        shipperName: 'المرسل',
        shipperAddress: 'دمشق',
        consigneeName: 'المستلم',
        consigneeAddress: 'بغداد',
        tankerNo: 'T-1',
        driverName: 'سائق',
        passportNo: 'P1'
      })
    )
    expect(listParties(db).map((p) => [p.name, p.address])).toEqual(
      expect.arrayContaining([
        ['المرسل', 'دمشق'],
        ['المستلم', 'بغداد']
      ])
    )
    expect(listTankers(db).map((t) => t.tankerNo)).toEqual(['T-1'])
    expect(listDrivers(db).map((d) => [d.name, d.passportNo])).toEqual([['سائق', 'P1']])
  })

  it('keeps its own address and passport while the stored ones stay, unless asked', () => {
    saveParty(db, 'المرسل', 'دمشق')
    saveDriver(db, 'سائق', 'P1')
    const doc = createDocument(
      db,
      sampleDocument(vesselId, {
        shipperName: 'المرسل',
        shipperAddress: 'حلب',
        driverName: 'سائق',
        passportNo: 'P2'
      })
    )
    expect(doc.shipperAddress).toBe('حلب')
    expect(doc.passportNo).toBe('P2')
    expect(listParties(db).find((p) => p.name === 'المرسل')?.address).toBe('دمشق')
    expect(listDrivers(db)[0].passportNo).toBe('P1')

    createDocument(
      db,
      sampleDocument(vesselId, {
        shipperName: 'المرسل',
        shipperAddress: 'حلب',
        driverName: 'سائق',
        passportNo: 'P2'
      }),
      { updateShipperAddress: true, updateDriverPassport: true }
    )
    expect(listParties(db).find((p) => p.name === 'المرسل')?.address).toBe('حلب')
    expect(listDrivers(db)[0].passportNo).toBe('P2')
  })

  it('updates the consignee address only when asked', () => {
    saveParty(db, 'المستلم', 'بغداد')
    const input = sampleDocument(vesselId, { consigneeName: 'المستلم', consigneeAddress: 'البصرة' })
    createDocument(db, input, { updateShipperAddress: true })
    expect(listParties(db).find((p) => p.name === 'المستلم')?.address).toBe('بغداد')
    createDocument(db, input, { updateConsigneeAddress: true })
    expect(listParties(db).find((p) => p.name === 'المستلم')?.address).toBe('البصرة')
  })

  it('saves nothing when the document insert fails', () => {
    db.$client.exec(`
      CREATE TRIGGER fail_insert BEFORE INSERT ON documents
      BEGIN SELECT RAISE(ABORT, 'forced failure'); END;
    `)
    expect(() => createDocument(db, sampleDocument(vesselId))).toThrow('forced failure')
    expect(listParties(db)).toEqual([])
    expect(listDrivers(db)).toEqual([])
    expect(listTankers(db)).toEqual([])
  })

  it('rolls back the document and its number when saving a lookup fails', () => {
    db.$client.exec(`
      CREATE TRIGGER fail_tanker BEFORE INSERT ON tankers
      BEGIN SELECT RAISE(ABORT, 'forced failure'); END;
    `)
    expect(() => createDocument(db, sampleDocument(vesselId))).toThrow('forced failure')
    expect(db.select().from(documents).all()).toEqual([])
    expect(db.select().from(counters).all()).toEqual([])
    expect(listParties(db)).toEqual([])
  })
})

/** The ServiceError code thrown by `run`. */
function codeOf(run: () => unknown): string | undefined {
  try {
    run()
  } catch (e) {
    return e instanceof ServiceError ? e.code : String(e)
  }
  return undefined
}

describe('editing lookups in settings', () => {
  it('adds a party with its name normalised and a blank address as null', () => {
    const p = createParty(db, { name: '  شركة   النور ', address: ' ' })
    expect(p).toEqual({ id: p.id, name: 'شركة النور', address: null })
    expect(listParties(db)).toEqual([p])
  })

  it('refuses an exact duplicate, ignoring case and spaces', () => {
    createParty(db, { name: 'Al Noor Co', address: null })
    expect(codeOf(() => createParty(db, { name: ' al  noor CO', address: 'x' }))).toBe(
      'LOOKUP_DUPLICATE'
    )
    createDriver(db, { name: 'أحمد', passportNo: null })
    expect(codeOf(() => createDriver(db, { name: 'أحمد ', passportNo: 'P' }))).toBe(
      'LOOKUP_DUPLICATE'
    )
    createTanker(db, { tankerNo: 'T-1' })
    expect(codeOf(() => createTanker(db, { tankerNo: 't-1' }))).toBe('LOOKUP_DUPLICATE')
  })

  it('allows a spelling variant (the UI only warns about it)', () => {
    createDriver(db, { name: 'أحمد', passportNo: null })
    createDriver(db, { name: 'احمد', passportNo: null })
    expect(listDrivers(db)).toHaveLength(2)
  })

  it('edits an entry, and refuses renaming it onto another one', () => {
    const a = createParty(db, { name: 'المرسل', address: 'دمشق' })
    createParty(db, { name: 'المستلم', address: null })
    expect(updateParty(db, a.id, { name: 'المرسل الجديد', address: 'حلب' })).toEqual({
      id: a.id,
      name: 'المرسل الجديد',
      address: 'حلب'
    })
    expect(codeOf(() => updateParty(db, a.id, { name: 'المستلم', address: null }))).toBe(
      'LOOKUP_DUPLICATE'
    )
    // Changing only the case of its own name is fine.
    const t = createTanker(db, { tankerNo: 'abc' })
    expect(updateTanker(db, t.id, { tankerNo: 'ABC' }).tankerNo).toBe('ABC')
    const d = createDriver(db, { name: 'سائق', passportNo: 'P1' })
    expect(updateDriver(db, d.id, { name: 'سائق', passportNo: '' }).passportNo).toBeNull()
  })

  it('validates input and reports missing entries', () => {
    expect(() => createTanker(db, { tankerNo: '  ' })).toThrow(ZodError)
    expect(codeOf(() => updateParty(db, 99, { name: 'x', address: null }))).toBe('LOOKUP_NOT_FOUND')
    expect(codeOf(() => deleteDriver(db, 99))).toBe('LOOKUP_NOT_FOUND')
  })

  it('deletes entries without changing saved documents', () => {
    const doc = createDocument(
      db,
      sampleDocument(vesselId, {
        shipperName: 'المرسل',
        shipperAddress: 'دمشق',
        driverName: 'سائق',
        passportNo: 'P1',
        tankerNo: 'T-9'
      })
    )
    const before = getDocumentView(db, doc.id)
    updateParty(db, listParties(db).find((p) => p.name === 'المرسل')!.id, {
      name: 'اسم آخر',
      address: 'حلب'
    })
    for (const p of listParties(db)) deleteParty(db, p.id)
    for (const d of listDrivers(db)) deleteDriver(db, d.id)
    for (const t of listTankers(db)) deleteTanker(db, t.id)

    expect(listParties(db)).toEqual([])
    expect(listDrivers(db)).toEqual([])
    expect(listTankers(db)).toEqual([])
    expect(getDocumentView(db, doc.id)).toEqual(before)
  })
})
