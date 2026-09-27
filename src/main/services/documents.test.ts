import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import type { DocumentListQuery } from '@shared/schemas'
import { backfillSearchText, type Db } from '../db/client'
import { documents } from '../db/schema'
import { openTestDb } from '../db/test-db'
import {
  createDocument,
  getDocumentView,
  getPrintableDocument,
  listDocuments,
  softDeleteDocument
} from './documents'
import { sampleDocument } from './test-fixtures'
import { createVessel, updateVessel } from './vessels'

let db: Db
let vesselA: number
let vesselB: number

beforeEach(() => {
  db = openTestDb()
  vesselA = createVessel(
    db,
    { name: 'MT Alpha', prefix: 'A', arrivalDate: null, isActive: true },
    { makeActive: true }
  ).id
  vesselB = createVessel(
    db,
    { name: 'MT Beta', prefix: 'B', arrivalDate: null, isActive: true },
    { makeActive: false }
  ).id
})

const add = (vesselId: number, overrides: Parameters<typeof sampleDocument>[1] = {}): number =>
  createDocument(db, sampleDocument(vesselId, overrides)).id

const serials = (query: DocumentListQuery = {}): string[] =>
  listDocuments(db, query).rows.map((r) => r.serialNo)

/** Text on several lines, without escape sequences. */
const lines = (...parts: string[]): string => parts.join(String.fromCharCode(10))

describe('search_text', () => {
  it('is written with the document, normalised, one field per line', () => {
    const id = add(vesselA, {
      driverName: 'أحمد الجبوري',
      tankerNo: '١٢٣',
      shipperName: 'شركة النور'
    })
    const row = db.select().from(documents).where(eq(documents.id, id)).get()!
    expect(row.searchText).toBe(
      lines('a00001', 'احمد الجبوري', '123', 'شركه النور', 'شركه المستلم')
    )
  })

  it('is filled in on startup for rows that have none', () => {
    const id = add(vesselA, { driverName: 'سائق قديم' })
    db.update(documents).set({ searchText: null }).where(eq(documents.id, id)).run()
    expect(serials({ search: 'قديم' })).toEqual([])
    expect(backfillSearchText(db)).toBe(1)
    expect(serials({ search: 'قديم' })).toEqual(['A00001'])
    expect(backfillSearchText(db)).toBe(0)
  })
})

describe('listDocuments', () => {
  it('lists newest first (by creation), with vessel and party columns', () => {
    add(vesselA, { issueDate: '2026-09-01' })
    add(vesselB, { issueDate: '2026-01-01' }) // back-dated, but created later
    add(vesselA)
    const page = listDocuments(db, {})
    expect(page.rows.map((r) => r.serialNo)).toEqual(['A00002', 'B00001', 'A00001'])
    expect(page.total).toBe(3)
    expect(page.rows[1]).toMatchObject({
      vesselId: vesselB,
      vesselName: 'MT Beta',
      vesselActive: true,
      issueDate: '2026-01-01',
      shipperName: 'شركة المرسل',
      consigneeName: 'شركة المستلم',
      tankerNo: '123456',
      driverName: 'سائق',
      deletedAt: null
    })
  })

  it('searches serial, driver, tanker, shipper and consignee, every word required', () => {
    add(vesselA, { driverName: 'محمد عبد الكريم الجبوري', tankerNo: 'بغداد 555' })
    add(vesselA, { driverName: 'محمد علي', shipperName: 'Al-Rafidain LLC' })
    add(vesselB, { consigneeName: 'مؤسسة الأمل' })
    expect(serials({ search: 'محمد الجبوري' })).toEqual(['A00001'])
    expect(serials({ search: 'مُحمّد' })).toEqual(['A00002', 'A00001'])
    expect(serials({ search: '٥٥٥' })).toEqual(['A00001'])
    expect(serials({ search: 'RAFIDAIN' })).toEqual(['A00002'])
    expect(serials({ search: 'b00001' })).toEqual(['B00001'])
    expect(serials({ search: 'موسسه الامل' })).toEqual(['B00001'])
    expect(serials({ search: '  ' })).toHaveLength(3)
    expect(serials({ search: 'غير موجود' })).toEqual([])
  })

  it('only searches the five fields', () => {
    add(vesselA, { crossingNo: 'CROSS-1', missionNo: 'MISSION-9', driverName: 'سالم' })
    expect(serials({ search: 'CROSS' })).toEqual([])
    expect(serials({ search: 'MISSION' })).toEqual([])
    expect(serials({ search: 'سالم' })).toEqual(['A00001'])
  })

  it('never matches one word across two fields', () => {
    // Driver "سا" + tanker "لم": the joined text must not contain "سالم".
    add(vesselA, { driverName: 'سا', tankerNo: 'لم' })
    expect(serials({ search: 'سالم' })).toEqual([])
    expect(serials({ search: 'سا لم' })).toEqual(['A00001'])
  })

  it('treats % and _ as plain characters', () => {
    add(vesselA, { tankerNo: '50%_X' })
    add(vesselA, { tankerNo: '5000' })
    expect(serials({ search: '%' })).toEqual(['A00001'])
    expect(serials({ search: '_' })).toEqual(['A00001'])
    expect(serials({ search: '50%' })).toEqual(['A00001'])
    expect(serials({ search: '!' })).toEqual([])
  })

  it('filters by vessel', () => {
    add(vesselA)
    add(vesselB)
    expect(serials({ vesselId: vesselB })).toEqual(['B00001'])
    expect(serials({ vesselId: null })).toEqual(['B00001', 'A00001'])
  })

  it('filters by issue date range, both ends inclusive', () => {
    add(vesselA, { issueDate: '2026-01-31' })
    add(vesselA, { issueDate: '2026-02-01' })
    add(vesselA, { issueDate: '2026-02-28' })
    add(vesselA, { issueDate: '2026-03-01' })
    expect(serials({ from: '2026-02-01', to: '2026-02-28' })).toEqual(['A00003', 'A00002'])
    expect(serials({ from: '2026-02-28' })).toEqual(['A00004', 'A00003'])
    expect(serials({ to: '2026-01-31' })).toEqual(['A00001'])
  })

  it('combines search, vessel and dates', () => {
    add(vesselA, { driverName: 'خالد', issueDate: '2026-05-01' })
    add(vesselB, { driverName: 'خالد', issueDate: '2026-05-01' })
    add(vesselB, { driverName: 'خالد', issueDate: '2026-06-01' })
    add(vesselB, { driverName: 'سامر', issueDate: '2026-05-01' })
    expect(serials({ search: 'خالد', vesselId: vesselB, to: '2026-05-31' })).toEqual(['B00001'])
  })

  it('hides deleted documents unless asked, and keeps their number taken', () => {
    const first = add(vesselA)
    add(vesselA)
    softDeleteDocument(db, first)
    expect(serials()).toEqual(['A00002'])
    const all = listDocuments(db, { includeDeleted: true })
    expect(all.rows.map((r) => r.serialNo)).toEqual(['A00002', 'A00001'])
    expect(all.rows[1].deletedAt).not.toBeNull()
    expect(all.total).toBe(2)
    add(vesselA)
    expect(serials()).toEqual(['A00003', 'A00002'])
  })

  it('lists documents of inactive vessels', () => {
    add(vesselB)
    updateVessel(db, vesselB, { isActive: false })
    const page = listDocuments(db, { vesselId: vesselB })
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]).toMatchObject({ serialNo: 'B00001', vesselActive: false })
  })

  it('pages the results and clamps a page past the end', () => {
    for (let i = 0; i < 7; i++) add(vesselA)
    const p2 = listDocuments(db, { page: 2, pageSize: 3 })
    expect(p2).toMatchObject({ total: 7, page: 2, pageSize: 3 })
    expect(p2.rows.map((r) => r.serialNo)).toEqual(['A00004', 'A00003', 'A00002'])
    const past = listDocuments(db, { page: 9, pageSize: 3 })
    expect(past.page).toBe(3)
    expect(past.rows.map((r) => r.serialNo)).toEqual(['A00001'])
    expect(listDocuments(db, { search: 'لا شيء' })).toMatchObject({ rows: [], total: 0, page: 1 })
  })

  it('rejects invalid queries', () => {
    expect(() => listDocuments(db, { pageSize: 500 })).toThrow(ZodError)
    expect(() => listDocuments(db, { from: '27/09/2026' })).toThrow(ZodError)
    expect(() => listDocuments(db, { page: 0 })).toThrow(ZodError)
  })
})

describe('deleted documents', () => {
  it('still open, with deletedAt set', () => {
    const id = add(vesselA)
    expect(getDocumentView(db, id).deletedAt).toBeNull()
    softDeleteDocument(db, id)
    expect(getDocumentView(db, id).deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('can not be printed or exported: DOCUMENT_DELETED', () => {
    const id = add(vesselA)
    expect(getPrintableDocument(db, id).serialNo).toBe('A00001')
    softDeleteDocument(db, id)
    expect(() => getPrintableDocument(db, id)).toThrow(
      expect.objectContaining({ code: 'DOCUMENT_DELETED' })
    )
    expect(() => getPrintableDocument(db, 999)).toThrow(
      expect.objectContaining({ code: 'DOCUMENT_NOT_FOUND' })
    )
  })

  it('deleting twice does nothing; a missing id is an error', () => {
    const id = add(vesselA)
    softDeleteDocument(db, id)
    const first = getDocumentView(db, id).deletedAt
    softDeleteDocument(db, id)
    expect(getDocumentView(db, id).deletedAt).toBe(first)
    expect(() => softDeleteDocument(db, 999)).toThrow(
      expect.objectContaining({ code: 'DOCUMENT_NOT_FOUND' })
    )
  })
})
