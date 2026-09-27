import { and, eq, isNull, sql } from 'drizzle-orm'
import { ServiceError } from '@shared/errors'
import { documentInputSchema, type DocumentInput } from '@shared/schemas'
import type { Db } from '../db/client'
import { documents, vessels, type DocumentRow, type Vessel } from '../db/schema'
import type { CreateDocumentOptions } from '@shared/api'
import { saveDriver, saveParty, saveTanker } from './lookups'
import { takeNextSerial } from './serial'

/**
 * The only way to create a document. Validates, takes the serial, inserts, and adds new
 * parties / tanker / driver to the lookups, all in one transaction: if anything fails, no
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
        .values({ ...data, number, serialNo })
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
