/**
 * The layout of templates/land-bl.xlsx as data, for the print view.
 *
 * Rows are listed top to bottom and, inside a row, cells go in the sheet's column order
 * (A → G, left to right on paper). A cell covered by a merge from an earlier row is skipped,
 * as in an HTML table. Positions are computed by `placeCells`; no cell address appears here,
 * and print-layout.test.ts checks that every value lands on its cell from fields.ts.
 */
import type { DocumentField, SettingKey } from '@shared/fields'

/** Fields printed on the document (everything except the vessel). */
export type PrintFieldKey = Extract<DocumentField, { print: true }>['key']
/** Printed fields holding one value; seals have their own 12 cells. */
export type ValueFieldKey = Exclude<PrintFieldKey, 'seals'>
export type AgentKey = Extract<SettingKey, 'customsAgent1' | 'customsAgent2'>

export type CellContent =
  | { kind: 'logo' }
  | { kind: 'blank' }
  /** Fixed text from the template: a section header or a label that isn't a field. */
  | { kind: 'text'; ar: string; en?: string }
  /** A field's bilingual label from fields.ts. */
  | { kind: 'label'; field: PrintFieldKey }
  | { kind: 'value'; field: ValueFieldKey }
  | { kind: 'seal'; index: number }
  | { kind: 'agent'; key: AgentKey }

export interface CellStyle {
  /** Starting font size in pt (the template's); long text shrinks from here. */
  size?: number
  bold?: boolean
  align?: 'start' | 'center' | 'left' | 'right'
  /** Arabic and English on two lines, as where the template wraps them. */
  stack?: boolean
  fill?: 'gray' | 'blue'
  dir?: 'ltr' | 'rtl'
  /** Borders that differ from the thin grid. Sides are physical (as printed). */
  bottom?: 'thick'
  right?: 'thick' | 'none'
  /**
   * Text may run over this many blank cells to its left, as Excel prints text next to an empty
   * cell. The merges stay as in the template; the blank cells just lose their inner border.
   */
  spillLeft?: number
}

export interface CellDef extends CellStyle {
  content: CellContent
  colSpan?: number
  rowSpan?: number
}

/** Column widths (Excel character units) and row heights (pt), from the template. */
export const COLUMN_WIDTHS = [18.14, 9.14, 10, 12.14, 12.57, 11.14, 20.43] as const
const TALL_ROWS: Record<number, number> = {
  1: 18.75,
  4: 16.5,
  5: 16.5,
  8: 16.5,
  9: 16.5,
  25: 16.5,
  26: 16.5,
  34: 16.5,
  35: 16.5
}
const DEFAULT_ROW_HEIGHT = 15.75

// Shorthands keep the table below readable.
const text = (ar: string, en?: string, style: Omit<CellDef, 'content'> = {}): CellDef => ({
  content: { kind: 'text', ar, en },
  ...style
})
const header = (ar: string, en?: string, style: Omit<CellDef, 'content'> = {}): CellDef =>
  text(ar, en, { size: 12, align: 'center', ...style })
const label = (field: PrintFieldKey, style: Omit<CellDef, 'content'> = {}): CellDef => ({
  content: { kind: 'label', field },
  size: 10,
  ...style
})
const value = (field: ValueFieldKey, style: Omit<CellDef, 'content'> = {}): CellDef => ({
  content: { kind: 'value', field },
  size: 12,
  align: 'center',
  ...style
})
const seal = (index: number): CellDef => ({
  content: { kind: 'seal', index },
  colSpan: 2,
  size: 12,
  align: 'center'
})
const blank = (style: Omit<CellDef, 'content'> = {}): CellDef => ({
  content: { kind: 'blank' },
  ...style
})
const signature = (style: Omit<CellDef, 'content'> = {}): CellDef =>
  text('التوقيع', 'Signature', { size: 10, align: 'center', stack: true, ...style })

/** The note text of rows 48–50 (validity blanks stay `______`). */
const note = (en: string, ar: string, size: number): CellDef[] => [
  text(en, undefined, { colSpan: 4, size, dir: 'ltr', align: 'left', fill: 'blue', right: 'none' }),
  text(ar, undefined, { colSpan: 3, size: 8, align: 'right', fill: 'blue' })
]

export const PRINT_ROWS: readonly (readonly CellDef[])[] = [
  // 1–8: logo, title, serial, date, parties
  [
    { content: { kind: 'logo' }, colSpan: 2, rowSpan: 8, right: 'thick', bottom: 'thick' },
    header('وثيقـــــة نقـــــل بـــــري', undefined, { colSpan: 5, size: 14 })
  ],
  [header('LAND BILL OF LADING', undefined, { colSpan: 5, dir: 'ltr' })],
  [value('serialNo', { colSpan: 4, dir: 'ltr' }), label('serialNo')],
  [value('issueDate', { colSpan: 4, bottom: 'thick' }), label('issueDate', { bottom: 'thick' })],
  [value('shipperName', { colSpan: 4, size: 10 }), label('shipperName')],
  [value('shipperAddress', { colSpan: 4 }), label('shipperAddress')],
  [value('consigneeName', { colSpan: 4 }), label('consigneeName')],
  [
    value('consigneeAddress', { colSpan: 4, bottom: 'thick' }),
    label('consigneeAddress', { bottom: 'thick' })
  ],

  // 9–18: loading
  [header('التحميل', 'Loading', { colSpan: 7 })],
  [header('الكمية', 'Qnty', { colSpan: 6 }), label('product', { size: 12, align: 'center' })],
  [
    value('qtyNaturalL', { colSpan: 4 }),
    blank({ right: 'none' }),
    label('qtyNaturalL', { spillLeft: 1 }),
    value('product', { rowSpan: 4 })
  ],
  [
    value('qtyStandardL', { colSpan: 4 }),
    blank({ right: 'none' }),
    label('qtyStandardL', { spillLeft: 1 })
  ],
  [value('weightKg', { colSpan: 4 }), label('weightKg', { colSpan: 2 })],
  [value('barrels', { colSpan: 4 }), label('barrels', { colSpan: 2 })],
  [seal(0), seal(1), seal(2), label('seals', { rowSpan: 4, align: 'center', stack: true })],
  [seal(3), seal(4), seal(5)],
  [seal(6), seal(7), seal(8)],
  [seal(9), seal(10), seal(11)],

  // 19–25: supply officer and quality
  [
    label('supplyOfficerName', { colSpan: 3, align: 'center' }),
    header('المواصفات النوعية', 'Quality & Specs', { colSpan: 4 })
  ],
  [
    value('supplyOfficerName', { colSpan: 3, size: 10 }),
    value('octane', { rowSpan: 2 }),
    label('octane', { rowSpan: 2, stack: true }),
    value('density15', { rowSpan: 2, size: 10 }),
    label('density15', { rowSpan: 2, stack: true })
  ],
  [label('supplyOfficerTitle', { colSpan: 3, align: 'center' })],
  [
    value('supplyOfficerTitle', { colSpan: 3 }),
    value('temperature'),
    label('temperature', { size: 8 }),
    value('flashPoint', { size: 10 }),
    label('flashPoint')
  ],
  [
    blank({ colSpan: 2, rowSpan: 3, bottom: 'thick' }),
    signature({ rowSpan: 3, bottom: 'thick' }),
    value('meterFactor'),
    label('meterFactor', { stack: true }),
    value('vcf', { rowSpan: 2, size: 10 }),
    label('vcf', { rowSpan: 2, size: 9, stack: true, align: 'center' })
  ],
  [
    value('crossingNo', { rowSpan: 2, bottom: 'thick' }),
    label('crossingNo', { rowSpan: 2, stack: true, align: 'center', bottom: 'thick' })
  ],
  [
    blank({ fill: 'gray', right: 'none', bottom: 'thick' }),
    blank({ fill: 'gray', bottom: 'thick' })
  ],

  // 26–34: customs agents and transportation
  [
    header('أسماء المخلصين', 'Customs clearance agents', { colSpan: 3, size: 10, fill: 'gray' }),
    header('النقل', 'Transportation', { colSpan: 4 })
  ],
  [
    {
      content: { kind: 'agent', key: 'customsAgent1' },
      colSpan: 3,
      rowSpan: 3,
      size: 10,
      align: 'center',
      fill: 'gray'
    },
    value('missionNo', { colSpan: 2, size: 10 }),
    label('missionNo', { colSpan: 2 })
  ],
  [value('supplyOrderNo', { colSpan: 2, size: 10 }), label('supplyOrderNo', { colSpan: 2 })],
  [value('supplyOrderDate', { colSpan: 2, size: 10 }), label('supplyOrderDate', { colSpan: 2 })],
  [
    {
      content: { kind: 'agent', key: 'customsAgent2' },
      colSpan: 3,
      rowSpan: 3,
      size: 10,
      align: 'center',
      fill: 'gray'
    },
    value('tankerNo', { colSpan: 3, size: 10 }),
    label('tankerNo')
  ],
  [value('driverName', { colSpan: 3, size: 10 }), label('driverName')],
  [value('passportNo', { colSpan: 3, size: 10 }), label('passportNo', { size: 9.5 })],
  [
    blank({ colSpan: 3, rowSpan: 2, bottom: 'thick' }),
    signature({ rowSpan: 2, bottom: 'thick' }),
    value('carrierRep', { colSpan: 2, size: 10 }),
    label('carrierRep')
  ],
  [
    value('transportDate', { colSpan: 2, size: 9, bottom: 'thick' }),
    label('transportDate', { bottom: 'thick' })
  ],

  // 35–47: discharging, printed blank
  [header('التفريغ', 'Discharging', { colSpan: 7 })],
  [
    blank({ rowSpan: 2 }),
    text('تاريخ الوصول', 'Arrival date', {
      colSpan: 2,
      rowSpan: 2,
      size: 10,
      align: 'center',
      stack: true
    }),
    text('الكمية المفرغة', undefined, { colSpan: 3, size: 10, align: 'center' }),
    blank()
  ],
  [blank({ colSpan: 3 }), label('qtyNaturalL')],
  [
    blank({ rowSpan: 2 }),
    text('تاريخ التفريغ', 'Discharging date', {
      colSpan: 2,
      rowSpan: 2,
      size: 10,
      align: 'center',
      stack: true
    }),
    blank({ colSpan: 3 }),
    label('qtyStandardL', { size: 9.5 })
  ],
  [blank({ colSpan: 3 }), label('weightKg')],
  [
    blank({ rowSpan: 2 }),
    text('موقع التفريغ', 'Discharging location', {
      colSpan: 2,
      rowSpan: 2,
      size: 10,
      align: 'center',
      stack: true
    }),
    blank({ colSpan: 3 }),
    label('barrels')
  ],
  [
    text('المواصفات النوعية للمنتج المفرغ', 'Quality Specs — Discharged / Transferred', {
      colSpan: 4,
      size: 10,
      align: 'center'
    })
  ],
  [
    text('إسم مستلم المنتج', 'Name of receiver', { colSpan: 3, size: 10, align: 'center' }),
    blank({ rowSpan: 2 }),
    label('temperature', { rowSpan: 2, stack: true }),
    blank({ rowSpan: 2 }),
    label('density15', { rowSpan: 2, stack: true })
  ],
  [blank({ colSpan: 3 })],
  [
    blank({ colSpan: 2, rowSpan: 2 }),
    signature({ rowSpan: 2 }),
    blank({ rowSpan: 2 }),
    text('نسبة الشوائب', 'impurity', { rowSpan: 2, size: 10, stack: true }),
    blank({ rowSpan: 2 }),
    label('vcf', { rowSpan: 2, stack: true })
  ],
  [],
  [
    blank({ colSpan: 2, rowSpan: 2 }),
    signature({ rowSpan: 2 }),
    text('الإسم', 'Name:', { colSpan: 2, rowSpan: 2, size: 10, stack: true }),
    text('مندوب شركة يو سي سي موقع التفريغ', 'UCC Representative - discharging location', {
      colSpan: 2,
      rowSpan: 2,
      size: 9,
      align: 'center',
      stack: true
    })
  ],
  [],

  // 48–50: footer notes, printed as in the template
  note(
    'Document valid for ______ from registration date within the same governorate.',
    '* المستند نافذ لمدة ______ من تاريخ التسجيل داخل نفس المحافظة.',
    7
  ),
  note(
    'Document valid for ______ when transferring product between governorates.',
    '* المستند نافذ لمدة ______ في حال نقل المنتوج من محافظة إلى محافظة أخرى.',
    7
  ),
  note(
    'Signed on receipt and retained by the issuing entity for disbursement purposes.',
    'موقعة بالاستلام وتحفظ في الجهة المصدرة لأغراض الصرف.',
    7.1
  )
]

export const COLUMN_COUNT = COLUMN_WIDTHS.length
export const ROW_HEIGHTS: readonly number[] = PRINT_ROWS.map(
  (_, i) => TALL_ROWS[i + 1] ?? DEFAULT_ROW_HEIGHT
)

export interface PlacedCell extends CellDef {
  /** 1-based sheet row and column (column 1 = A, the left edge of the page). */
  row: number
  col: number
  colSpan: number
  rowSpan: number
}

/** Positions every cell the way a table does: each goes to the next column not already covered. */
export function placeCells(rows: readonly (readonly CellDef[])[] = PRINT_ROWS): PlacedCell[] {
  const taken = rows.map(() => new Array<boolean>(COLUMN_COUNT).fill(false))
  const placed: PlacedCell[] = []
  rows.forEach((cells, r) => {
    let c = 0
    for (const cell of cells) {
      while (c < COLUMN_COUNT && taken[r][c]) c++
      const colSpan = cell.colSpan ?? 1
      const rowSpan = cell.rowSpan ?? 1
      if (c + colSpan > COLUMN_COUNT || r + rowSpan > rows.length)
        throw new Error(`Print layout: cell overflows the sheet at row ${r + 1}`)
      for (let dr = 0; dr < rowSpan; dr++)
        for (let dc = 0; dc < colSpan; dc++) {
          if (taken[r + dr][c + dc])
            throw new Error(`Print layout: cells overlap at row ${r + dr + 1}`)
          taken[r + dr][c + dc] = true
        }
      placed.push({ ...cell, row: r + 1, col: c + 1, colSpan, rowSpan })
      c += colSpan
    }
    if (taken[r].some((t) => !t)) throw new Error(`Print layout: row ${r + 1} is not full`)
  })
  return placed
}

export const PLACED_CELLS = placeCells()
