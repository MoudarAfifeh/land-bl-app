import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { beforeEach, describe, expect, it } from 'vitest'
import { exportSlots } from '@shared/fields'
import type { Db } from '../db/client'
import { openTestDb } from '../db/test-db'
import { createDocument } from './documents'
import { buildExport } from './export'
import { SHEET_PART } from './export-excel'
import { serviceErrorOf } from './save-file'
import { setSetting } from './settings'
import { longDocument, sampleDocument } from './test-fixtures'
import { sheetCells } from './test-xlsx'
import { createVessel, updateVessel } from './vessels'

const templatesDir = resolve('templates')
const cellOf = (key: string): string => exportSlots().find((s) => s.key === key)!.cell

let db: Db
let vesselId: number

beforeEach(() => {
  db = openTestDb()
  vesselId = createVessel(
    db,
    { name: 'MT E', prefix: 'E', arrivalDate: null, isActive: true },
    { makeActive: true }
  ).id
})

describe('buildExport', () => {
  it('fills the Excel template from the saved document and its agent blocks', async () => {
    setSetting(db, 'customsAgent2', 'وكيل جديد\nسطر ثاني')
    const { id } = createDocument(db, { ...longDocument, vesselId }, {})
    const { serialNo, data } = await buildExport(db, id, 'excel', templatesDir)
    expect(serialNo).toBe('E00001')
    const cells = sheetCells(data).cells
    expect(cells[cellOf('serialNo')].text).toBe('E00001')
    expect(cells[cellOf('customsAgent2')].text).toBe('وكيل جديد\nسطر ثاني')
    expect(cells[cellOf('customsAgent1')].text).toContain('معبر التنف')
    expect(new PizZip(data).file(SHEET_PART)).not.toBeNull()
  })

  it('keeps the agent blocks the document was saved with after settings change', async () => {
    const { id } = createDocument(db, sampleDocument(vesselId), {})
    const before = await buildExport(db, id, 'excel', templatesDir)
    setSetting(db, 'customsAgent1', 'مخلص آخر')
    setSetting(db, 'customsAgent2', null)
    const after = await buildExport(db, id, 'excel', templatesDir)
    expect(sheetCells(after.data).cells).toEqual(sheetCells(before.data).cells)
    expect(sheetCells(after.data).cells[cellOf('customsAgent1')].text).toContain('معبر التنف')

    const word = await buildExport(db, id, 'word', templatesDir)
    const xml = new PizZip(word.data).file('word/document.xml')!.asText()
    expect(xml).toContain('معبر الوليد')
    expect(xml).not.toContain('مخلص آخر')
  })

  it('fills the Word template', async () => {
    const { id } = createDocument(db, sampleDocument(vesselId, { driverName: 'سائق التجربة' }), {})
    const { data } = await buildExport(db, id, 'word', templatesDir)
    const xml = new PizZip(data).file('word/document.xml')!.asText()
    expect(xml).toContain('سائق التجربة')
    expect(xml).toContain('E00001')
  })

  it('exports documents of an inactive vessel the same way', async () => {
    const { id } = createDocument(db, sampleDocument(vesselId), {})
    const before = await buildExport(db, id, 'excel', templatesDir)
    updateVessel(db, vesselId, { isActive: false })
    const after = await buildExport(db, id, 'excel', templatesDir)
    expect(sheetCells(after.data).cells).toEqual(sheetCells(before.data).cells)
  })

  it('reports a missing document', async () => {
    await expect(buildExport(db, 99, 'word', templatesDir)).rejects.toMatchObject({
      code: 'DOCUMENT_NOT_FOUND'
    })
  })
})

describe('serviceErrorOf', () => {
  it('reports a file open in another program as FILE_IN_USE', () => {
    const busy = Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
    expect(serviceErrorOf(busy, 'EXCEL_FAILED').code).toBe('FILE_IN_USE')
  })

  it('reports anything else as the given failure', () => {
    const denied = Object.assign(new Error('EACCES'), { code: 'EACCES' })
    expect(serviceErrorOf(denied, 'WORD_FAILED').code).toBe('WORD_FAILED')
  })
})
