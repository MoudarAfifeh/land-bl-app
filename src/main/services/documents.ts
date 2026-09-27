import { and, count, desc, eq, gte, isNull, lte, sql, type SQL } from 'drizzle-orm'
import { ServiceError } from '@shared/errors'
import {
  documentInputSchema,
  documentListQuerySchema,
  type DocumentInput,
  type DocumentListQuery
} from '@shared/schemas'
import { escapeLike, searchText, searchTokens } from '@shared/search'
import type { Db } from '../db/client'
import { documents, vessels, type DocumentRow, type Vessel } from '../db/schema'
import type {
  CreateDocumentOptions,
  DocumentListPage,
  DocumentListRow,
  DocumentView
} from '@shared/api'
import { documentInputFields } from '@shared/fields'
import { saveDriver, saveParty, saveTanker } from './lookups'
import { takeNextSerial } from './serial'
import { getCustomsAgents } from './settings'

/**
 * The only way to create a document. Validates, takes the serial, inserts it with a copy of the
 * customs agent blocks from settings, and adds new parties / tanker / driver to the lookups, all in one transaction: if anything fails, no
 * number is burnt and no lookup row is left behind.
 */
export function createDocument(
  db: Db,
  input: DocumentInput,
  options: CreateDocumentOptions = {}
): DocumentRow {
  const data = documentInputSchema.parse(input)
  return db.transaction(
    (tx) => {
      const { number, serialNo } = takeNextSerial(tx, data.vesselId)
      const doc = tx
        .insert(documents)
        // Documents are never edited after save, so search_text can't go stale.
        .values({
          ...data,
          ...getCustomsAgents(tx),
          number,
          serialNo,
          searchText: searchText({ ...data, serialNo })
        })
        .returning()
        .get()

      saveParty(tx, data.shipperName, data.shipperAddress, {
        updateStored: options.updateShipperAddress
      })
      saveParty(tx, data.consigneeName, data.consigneeAddress, {
        updateStored: options.updateConsigneeAddress
      })
      saveTanker(tx, data.tankerNo)
      saveDriver(tx, data.driverName, data.passportNo, {
        updateStored: options.updateDriverPassport
      })
      return doc
    },
    { behavior: 'immediate' }
  )
}

/**
 * Reads a document with its vessel, whether or not the vessel is still active,
 * so old documents can always be opened, printed and re-exported.
 */
export function getDocument(db: Db, id: number): DocumentRow & { vessel: Vessel } {
  const row = db
    .select()
    .from(documents)
    .innerJoin(vessels, eq(documents.vesselId, vessels.id))
    .where(eq(documents.id, id))
    .get()
  if (!row) throw new ServiceError('DOCUMENT_NOT_FOUND')
  return { ...row.documents, vessel: row.vessels }
}

/** A document as the UI reads it: its input fields, id, serial and its own agent blocks. */
export function getDocumentView(db: Db, id: number): DocumentView {
  const row = getDocument(db, id)
  const view: Record<string, unknown> = {
    id: row.id,
    serialNo: row.serialNo,
    deletedAt: row.deletedAt,
    customsAgent1: row.customsAgent1,
    customsAgent2: row.customsAgent2
  }
  for (const f of documentInputFields) view[f.key] = row[f.key]
  return view as DocumentView
}

/**
 * A document that may be printed or exported: DOCUMENT_DELETED for a soft-deleted one. Enforced
 * in main so hiding the buttons is not the only guard.
 */
export function getPrintableDocument(db: Db, id: number): DocumentRow & { vessel: Vessel } {
  const doc = getDocument(db, id)
  if (doc.deletedAt !== null) throw new ServiceError('DOCUMENT_DELETED')
  return doc
}

/**
 * The history: newest first by creation. Every word of `search` must appear in the document's
 * serial, driver, tanker, shipper or consignee (normalised, see shared/search.ts). Documents of
 * inactive vessels are included; deleted ones only with `includeDeleted`.
 */
export function listDocuments(db: Db, query: DocumentListQuery): DocumentListPage {
  const q = documentListQuerySchema.parse(query)
  const d = documents
  const where: SQL[] = []
  if (!q.includeDeleted) where.push(isNull(d.deletedAt))
  if (q.vesselId !== null) where.push(eq(d.vesselId, q.vesselId))
  if (q.from !== null) where.push(gte(d.issueDate, q.from))
  if (q.to !== null) where.push(lte(d.issueDate, q.to))
  for (const token of searchTokens(q.search)) {
    where.push(sql`${d.searchText} LIKE ${`%${escapeLike(token)}%`} ESCAPE '!'`)
  }
  const condition = and(...where)

  const total = db.select({ n: count() }).from(d).where(condition).get()?.n ?? 0
  const lastPage = Math.max(1, Math.ceil(total / q.pageSize))
  const page = Math.min(q.page, lastPage)

  const rows: DocumentListRow[] = db
    .select({
      id: d.id,
      serialNo: d.serialNo,
      issueDate: d.issueDate,
      vesselId: d.vesselId,
      vesselName: vessels.name,
      vesselActive: vessels.isActive,
      shipperName: d.shipperName,
      consigneeName: d.consigneeName,
      tankerNo: d.tankerNo,
      driverName: d.driverName,
      deletedAt: d.deletedAt
    })
    .from(d)
    .innerJoin(vessels, eq(d.vesselId, vessels.id))
    .where(condition)
    .orderBy(desc(d.id))
    .limit(q.pageSize)
    .offset((page - 1) * q.pageSize)
    .all()

  return { rows, total, page, pageSize: q.pageSize }
}

/** Soft delete: the row and its serial number stay taken forever. */
export function softDeleteDocument(db: Db, id: number): void {
  const result = db
    .update(documents)
    .set({ deletedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` })
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
    .run()
  if (result.changes === 0 && !db.select().from(documents).where(eq(documents.id, id)).get())
    throw new ServiceError('DOCUMENT_NOT_FOUND')
}
