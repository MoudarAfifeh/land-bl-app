import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { beforeAll, describe, expect, it } from 'vitest'
import type { DocumentView } from '@shared/api'
import { exportSlots } from '@shared/fields'
import { exportCells } from './export-data'
import { escapeXml, fillSheetXml, fillWorkbook, SHEET_PART } from './export-excel'
import { longDocument, sampleDocument } from './test-fixtures'
import { saveTestOutput } from './test-output'
import { parseXml, sheetCells, snapshotXlsx } from './test-xlsx'

const template = readFileSync(resolve('templates/land-bl.xlsx'))
const slots = exportSlots()
const cellOf = (key: string): string => slots.find((s) => s.key === key)!.cell
const targets = new Set(slots.map((s) => s.cell))

const agents = {
  customsAgent1: 'المخلص السوري/ معبر التنف\nشركة الحسن/ عمر سفيان\n00963-933-351758',
  customsAgent2: 'المخلص العراقي / معبر الوليد\nبشار أبو حسن\n00964-772-3247959'
}

const longView: DocumentView = {
  ...longDocument,
  vesselId: 1,
  id: 1,
  serialNo: 'T00001',
  deletedAt: null
}

let output: Buffer

beforeAll(() => {
  output = fillWorkbook(template, exportCells(longView, agents))
  saveTestOutput('long-12-seals.xlsx', output)
})

describe('the filled workbook keeps the template', () => {
  it('leaves every other part of the file byte-identical', () => {
    const before = new PizZip(template)
    const after = new PizZip(output)
    expect(Object.keys(after.files).sort()).toEqual(Object.keys(before.files).sort())
    for (const name of Object.keys(before.files)) {
      if (name === SHEET_PART || before.files[name].dir) continue
      expect(
        Buffer.from(after.file(name)!.asUint8Array()).equals(
          Buffer.from(before.file(name)!.asUint8Array())
        ),
        name
      ).toBe(true)
    }
  })

  it('changes nothing in sheet1.xml outside sheetData', () => {
    const strip = (buf: Buffer): string =>
      new PizZip(buf)
        .file(SHEET_PART)!
        .asText()
        .replace(/<sheetData[\s\S]*<\/sheetData>/, '')
    expect(strip(output)).toBe(strip(template))
  })

  it('changes only the target cells from fields.ts, and keeps their style', () => {
    const before = sheetCells(template)
    const after = sheetCells(output)
    expect(after.rows).toEqual(before.rows)
    const changed = Object.keys(after.cells).filter(
      (ref) => JSON.stringify(after.cells[ref].node) !== JSON.stringify(before.cells[ref].node)
    )
    expect(changed.filter((ref) => !targets.has(ref))).toEqual([])
    for (const ref of targets) expect(after.cells[ref].s, ref).toBe(before.cells[ref].s)
  })

  it('keeps the logo, the 98 merges, sizes, styles and one-page print settings', () => {
    const withoutValues = (s: ReturnType<typeof snapshotXlsx>): object => ({ ...s, values: {} })
    const after = snapshotXlsx(output)
    expect(withoutValues(after)).toEqual(withoutValues(snapshotXlsx(template)))
    expect(after.merges).toHaveLength(98)
    expect(after.images).toHaveLength(1)
    expect(after.pageSetup).toMatchObject({ paperSize: 9, fitToWidth: 1, fitToHeight: 1 })
  })

  it('leaves labels and other template text as they were', () => {
    const before = snapshotXlsx(template).values
    const after = snapshotXlsx(output).values
    for (const [ref, text] of Object.entries(before)) {
      if (!targets.has(ref)) expect(after[ref], ref).toBe(text)
    }
  })
})

describe('values land in the right cells', () => {
  const cells = (): ReturnType<typeof sheetCells>['cells'] => sheetCells(output).cells

  it('writes text and dates as inline strings', () => {
    const c = cells()
    expect(c[cellOf('serialNo')]).toMatchObject({ t: 'inlineStr', text: 'T00001' })
    expect(c[cellOf('issueDate')]).toMatchObject({ t: 'inlineStr', text: '27/09/2026' })
    expect(c[cellOf('supplyOrderDate')]).toMatchObject({ t: 'inlineStr', text: '20/09/2026' })
    expect(c[cellOf('shipperName')].text).toBe(longDocument.shipperName)
    expect(c[cellOf('consigneeName')].text).toBe(longDocument.consigneeName)
    expect(c[cellOf('driverName')].text).toBe(longDocument.driverName)
    expect(c[cellOf('tankerNo')].text).toBe(longDocument.tankerNo)
    expect(c[cellOf('product')].text).toBe(longDocument.product)
  })

  it('writes numbers as numbers', () => {
    const c = cells()
    expect(c[cellOf('qtyNaturalL')]).toMatchObject({ t: 'n', text: '36123.456' })
    expect(c[cellOf('flashPoint')]).toMatchObject({ t: 'n', text: '-43' })
    expect(c[cellOf('density15')]).toMatchObject({ t: 'n', text: '0.7456' })
  })

  it('writes the 12 seals to their 12 cells, in order', () => {
    const c = cells()
    for (let i = 0; i < 12; i++) {
      expect(c[cellOf(`seal${i + 1}`)].text).toBe(longDocument.seals[i])
    }
  })

  it('writes both multi-line agent blocks into wrapping cells', () => {
    const c = cells()
    const styles = snapshotXlsx(output).styles
    for (const key of ['customsAgent1', 'customsAgent2'] as const) {
      expect(c[cellOf(key)].text).toBe(agents[key])
      expect(JSON.stringify(styles[cellOf(key)])).toContain('"wrapText":"1"')
    }
    const raw = new PizZip(output).file(SHEET_PART)!.asText()
    expect(raw).toContain('<t xml:space="preserve">المخلص السوري/ معبر التنف\n')
  })
})

describe('special values', () => {
  it('escapes & < > and keeps quotes, Arabic text and line breaks', () => {
    const tricky = `شركة "الأمل" & أولاده <فرع 2> 'دمشق'`
    const view: DocumentView = {
      ...sampleDocument(1, { shipperName: tricky, consigneeName: 'A&B <C> "D" \'E\'' }),
      id: 2,
      serialNo: 'B00002',
      deletedAt: null
    }
    const multiLine = { customsAgent1: 'سطر أول & "ثاني"\nLine <2>\n\nرابع', customsAgent2: null }
    const out = fillWorkbook(template, exportCells(view, multiLine))
    saveTestOutput('special-characters.xlsx', out)

    const c = sheetCells(out).cells
    expect(c[cellOf('shipperName')].text).toBe(tricky)
    expect(c[cellOf('consigneeName')].text).toBe('A&B <C> "D" \'E\'')
    expect(c[cellOf('customsAgent1')].text).toBe(multiLine.customsAgent1)
    expect(escapeXml('a & <b>')).toBe('a &amp; &lt;b&gt;')
    // Control characters XML can't hold (e.g. pasted from another program) are dropped.
    expect(escapeXml('A\u0001B\u000BC\tD')).toBe('ABC\tD')
    // The whole sheet is still well-formed XML.
    expect(() => parseXml(new PizZip(out).file(SHEET_PART)!.asText())).not.toThrow()
  })

  it('empties a cell but keeps it and its style', () => {
    const view: DocumentView = {
      ...sampleDocument(1, { weightKg: null }),
      id: 3,
      serialNo: 'A00003',
      deletedAt: null
    }
    const out = fillWorkbook(
      template,
      exportCells(view, { customsAgent1: null, customsAgent2: null })
    )
    const before = sheetCells(template).cells
    const c = sheetCells(out).cells
    for (const key of ['customsAgent1', 'weightKg', 'seal12']) {
      const ref = cellOf(key)
      expect(c[ref], key).toMatchObject({ t: 'n', text: '', s: before[ref].s })
    }
    // The template's own agent text is gone, not left behind.
    expect(before[cellOf('customsAgent1')].text).not.toBe('')
  })
})

describe('fillSheetXml on a sheet with missing cells and rows', () => {
  const sheet = (rows: string): string =>
    `<worksheet><cols><col min="1" max="3" width="9" style="7"/></cols><sheetData>${rows}</sheetData><mergeCells count="0"/></worksheet>`

  it('inserts a missing cell in column order, with the column style', () => {
    const xml = fillSheetXml(sheet('<row r="2"><c r="A2" s="1"/><c r="C2" s="3"/></row>'), [
      { cell: 'B2', value: 'x' }
    ])
    expect(xml).toContain(
      '<row r="2"><c r="A2" s="1"/><c r="B2" s="7" t="inlineStr"><is><t xml:space="preserve">x</t></is></c><c r="C2" s="3"/></row>'
    )
  })

  it('inserts a missing row in row order', () => {
    const xml = fillSheetXml(sheet('<row r="1"><c r="A1"/></row><row r="5"><c r="A5"/></row>'), [
      { cell: 'B3', value: 42 },
      { cell: 'A9', value: null }
    ])
    expect(xml).toContain(
      '<sheetData><row r="1"><c r="A1"/></row><row r="3"><c r="B3" s="7"><v>42</v></c></row><row r="5"><c r="A5"/></row><row r="9"><c r="A9" s="7"/></row></sheetData>'
    )
  })

  it('uses the row style for a new cell when the row has one', () => {
    const xml = fillSheetXml(
      sheet('<row r="64" s="9" customFormat="1" spans="1:1"><c r="A64"/></row>'),
      [{ cell: 'C64', value: 'y' }]
    )
    expect(xml).toContain(
      '<row r="64" s="9" customFormat="1"><c r="A64"/><c r="C64" s="9" t="inlineStr">'
    )
  })

  it('handles an empty sheetData', () => {
    const xml = fillSheetXml('<worksheet><sheetData/></worksheet>', [{ cell: 'A1', value: 1 }])
    expect(xml).toBe(
      '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>'
    )
  })

  it('replaces a formula or old value and drops the old type', () => {
    const xml = fillSheetXml(
      sheet('<row r="1"><c r="A1" s="2" t="str"><f>1+1</f><v>2</v></c></row>'),
      [{ cell: 'A1', value: 5 }]
    )
    expect(xml).toContain('<row r="1"><c r="A1" s="2"><v>5</v></c></row>')
  })
})
