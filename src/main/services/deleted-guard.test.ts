/**
 * A deleted document can be opened but never printed or exported: main refuses with
 * DOCUMENT_DELETED before any window or save dialog opens (the electron stub used in unit tests
 * throws if one is opened).
 */
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { openTestDb } from '../db/test-db'
import { createDocument, softDeleteDocument } from './documents'
import { buildExport } from './export'
import { createExportService } from './export-dialog'
import { createPrintService } from './print'
import { sampleDocument } from './test-fixtures'
import { createVessel } from './vessels'

let db: Db
let deletedId: number

beforeEach(() => {
  db = openTestDb()
  const vessel = createVessel(
    db,
    { name: 'MT D', prefix: 'D', arrivalDate: null, isActive: true },
    { makeActive: true }
  )
  deletedId = createDocument(db, sampleDocument(vessel.id)).id
  softDeleteDocument(db, deletedId)
})

const deleted = expect.objectContaining({ code: 'DOCUMENT_DELETED' })

describe('a deleted document', () => {
  it('can not be printed', async () => {
    await expect(createPrintService(db, () => null).print(deletedId)).rejects.toEqual(deleted)
  })

  it('can not be saved as PDF', async () => {
    await expect(createPrintService(db, () => null).savePdf(deletedId)).rejects.toEqual(deleted)
  })

  it('can not be exported to Excel', async () => {
    await expect(createExportService(db, () => null).excel(deletedId)).rejects.toEqual(deleted)
    await expect(buildExport(db, deletedId, 'excel', resolve('templates'))).rejects.toEqual(deleted)
  })

  it('can not be exported to Word', async () => {
    await expect(createExportService(db, () => null).word(deletedId)).rejects.toEqual(deleted)
    await expect(buildExport(db, deletedId, 'word', resolve('templates'))).rejects.toEqual(deleted)
  })
})
