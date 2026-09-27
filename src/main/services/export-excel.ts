/**
 * Excel export: fills a copy of templates/land-bl.xlsx by editing the worksheet XML directly.
 * Only the target cells change; every other part of the file stays byte for byte as in the
 * template. (ExcelJS could not load this template and rounded its 9.5 / 7.1 pt fonts.)
 *
 * Text and dates are inline strings, numbers are `<v>`. Each cell keeps its `s` style.
 */
import PizZip from 'pizzip'

/** The template's only worksheet. */
export const SHEET_PART = 'xl/worksheets/sheet1.xml'

export interface CellValue {
  /** Top-left cell of the (possibly merged) range, from fields.ts. */
  cell: string
  /** null empties the cell but keeps it and its style. */
  value: string | number | null
}

export function fillWorkbook(template: Uint8Array, cells: readonly CellValue[]): Buffer {
  const zip = new PizZip(template)
  const sheet = zip.file(SHEET_PART)
  if (!sheet) throw new Error(`template has no ${SHEET_PART}`)
  zip.file(SHEET_PART, fillSheetXml(sheet.asText(), cells))
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

interface Cell {
  col: number
  xml: string
}

interface Row {
  r: number
  /** Attributes of `<row …>`, as written. */
  attrs: string
  /** Original XML, re-emitted untouched when no cell of the row changes. */
  xml: string
  cells: Cell[] | null
}

const ROW_RE = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g
const CELL_RE = /<c\b([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs)
  return m ? (m[1] ?? m[2]) : undefined
}

function splitRef(ref: string): { col: number; row: number } {
  const m = /^([A-Z]{1,3})([1-9]\d*)$/.exec(ref)
  if (!m) throw new Error(`bad cell reference ${ref}`)
  const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
  return { col, row: Number(m[2]) }
}

// Characters XML 1.0 forbids, even escaped.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g

export function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** `<c>` for a value, keeping the cell's attributes (style) but not its old type. */
function cellXml(attrs: string, value: string | number | null): string {
  const kept = attrs.replace(/\s+t\s*=\s*(?:"[^"]*"|'[^']*')/, '').replace(/\s+$/, '')
  if (value === null) return `<c${kept}/>`
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`not a finite number: ${value}`)
    return `<c${kept}><v>${String(value)}</v></c>`
  }
  const text = escapeXml(value.replace(/\r\n?/g, '\n'))
  return `<c${kept} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`
}

function parseCells(inner: string, r: number): Cell[] {
  const cells: Cell[] = []
  let rest = inner
  for (const m of inner.matchAll(CELL_RE)) {
    const ref = attr(m[1], 'r')
    if (!ref) throw new Error(`cell without reference in row ${r}`)
    cells.push({ col: splitRef(ref).col, xml: m[0] })
    rest = rest.replace(m[0], '')
  }
  if (rest.trim() !== '') throw new Error(`unexpected content in row ${r}`)
  return cells
}

/** Default style of a column from `<cols>`, used for a cell the template doesn't have. */
function columnStyle(sheetXml: string, col: number): string | undefined {
  for (const m of sheetXml.matchAll(/<col\b([^>]*?)\/?>/g)) {
    const min = Number(attr(m[1], 'min'))
    const max = Number(attr(m[1], 'max'))
    if (col >= min && col <= max) return attr(m[1], 'style')
  }
  return undefined
}

export function fillSheetXml(xml: string, values: readonly CellValue[]): string {
  const sd = /<sheetData\s*\/>|<sheetData\b([^>]*)>([\s\S]*?)<\/sheetData>/.exec(xml)
  if (!sd) throw new Error('worksheet has no sheetData')

  const rows: Row[] = [...(sd[2] ?? '').matchAll(ROW_RE)].map((m) => {
    const r = Number(attr(m[1], 'r'))
    if (!Number.isInteger(r) || r < 1) throw new Error('row without number')
    return { r, attrs: m[1], xml: m[0], cells: null }
  })

  for (const { cell: ref, value } of values) {
    const { col, row: r } = splitRef(ref)

    let row = rows.find((x) => x.r === r)
    if (!row) {
      row = { r, attrs: ` r="${r}"`, xml: '', cells: [] }
      const at = rows.findIndex((x) => x.r > r)
      rows.splice(at === -1 ? rows.length : at, 0, row)
    }
    const inner = /^<row\b[^>]*?>([\s\S]*)<\/row>$/.exec(row.xml)?.[1] ?? ''
    row.cells ??= parseCells(inner, r)

    const existing = row.cells.find((c) => c.col === col)
    if (existing) {
      const attrs = /^<c\b([^>]*?)\/?>/.exec(existing.xml)![1]
      existing.xml = cellXml(attrs, value)
    } else {
      // New cell: the row's style if it has one, else the column's.
      const style =
        attr(row.attrs, 'customFormat') === '1' ? attr(row.attrs, 's') : columnStyle(xml, col)
      const cell = { col, xml: cellXml(` r="${ref}"${style ? ` s="${style}"` : ''}`, value) }
      const at = row.cells.findIndex((c) => c.col > col)
      row.cells.splice(at === -1 ? row.cells.length : at, 0, cell)
      // `spans` is only a loading hint; drop it rather than leave it wrong.
      row.attrs = row.attrs.replace(/\s+spans\s*=\s*(?:"[^"]*"|'[^']*')/, '')
    }
  }

  const body = rows
    .map((row) =>
      row.cells === null
        ? row.xml
        : `<row${row.attrs}>${row.cells.map((c) => c.xml).join('')}</row>`
    )
    .join('')
  const open = sd[1] !== undefined ? `<sheetData${sd[1]}>` : '<sheetData>'
  return xml.slice(0, sd.index) + `${open}${body}</sheetData>` + xml.slice(sd.index + sd[0].length)
}
