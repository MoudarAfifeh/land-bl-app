import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { counters, documents } from '../db/schema'
import { openTestDb } from '../db/test-db'
import { createDocument } from './documents'
import { listDrivers, listParties, listTankers, saveDriver, saveParty, saveTanker } from './lookups'
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
