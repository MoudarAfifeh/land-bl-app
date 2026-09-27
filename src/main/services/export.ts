/**
 * Builds the Excel or Word file of a saved document from its template. No Electron here:
 * the dialog and the write are in export-dialog.ts. Templates are only read, never written.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExportFormat } from '@shared/api'
import type { Db } from '../db/client'
import { getDocumentView, getPrintableDocument } from './documents'
import { exportCells, wordData } from './export-data'
import { fillWorkbook } from './export-excel'
import { fillDocument } from './export-word'

export const exportFormats = {
  excel: { template: 'land-bl.xlsx', extension: 'xlsx', filter: 'Excel', failure: 'EXCEL_FAILED' },
  word: { template: 'land-bl.docx', extension: 'docx', filter: 'Word', failure: 'WORD_FAILED' }
} as const satisfies Record<ExportFormat, object>

/** The filled file, with the serial for its default name. */
export async function buildExport(
  db: Db,
  id: number,
  format: ExportFormat,
  templatesDir: string
): Promise<{ serialNo: string; data: Buffer }> {
  getPrintableDocument(db, id) // a deleted document is never exported
  const doc = getDocumentView(db, id)
  const cells = exportCells(doc)
  const template = await readFile(join(templatesDir, exportFormats[format].template))
  const data =
    format === 'excel' ? fillWorkbook(template, cells) : fillDocument(template, wordData(cells))
  return { serialNo: doc.serialNo, data }
}
