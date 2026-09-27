/**
 * Test helper: reads an .xlsx straight from its XML and returns what an export must keep:
 * merges, column widths, row heights, every cell's resolved style, page setup, print area and
 * the logo. Style indices are resolved to the font / fill / border / alignment they point at,
 * because a writer is free to renumber them.
 */
import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import PizZip from 'pizzip'

export interface XmlNode {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  text: string
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, e: string) => {
    if (e[0] === '#') {
      return String.fromCodePoint(
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)
      )
    }
    return entities[e] ?? whole
  })
}

/** Local name without namespace prefix. */
const local = (name: string): string => name.slice(name.indexOf(':') + 1)

/** Minimal parser for the well-formed XML inside Office files. */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#root', attrs: {}, children: [], text: '' }
  const stack = [root]
  const re =
    /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[^>]*\?>|<!--[\s\S]*?-->|([^<]+)/g
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const [, closing, name, rawAttrs, selfClosing, text] = m
    const top = stack[stack.length - 1]
    if (text !== undefined) {
      top.text += decode(text)
    } else if (!name) {
      continue
    } else if (closing) {
      stack.pop()
    } else {
      const attrs: Record<string, string> = {}
      for (const a of rawAttrs.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attrs[a[1]] = decode(a[2] ?? a[3])
      }
      const node: XmlNode = { name: local(name), attrs, children: [], text: '' }
      top.children.push(node)
      if (!selfClosing) stack.push(node)
    }
  }
  return root
}

export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((c) => c.name === name)
}

export function children(node: XmlNode | undefined, name: string): XmlNode[] {
  return node?.children.filter((c) => c.name === name) ?? []
}

/** All text below a node, e.g. an inline string `<is><t>…</t></is>`. */
function allText(node: XmlNode): string {
  return node.text + node.children.map(allText).join('')
}

/**
 * A style element as a stable value: attributes without xmlns, children sorted, boolean
 * attributes normalised (`<b/>` = `<b val="1"/>`, `val="0"` = absent).
 */
export function canonical(node: XmlNode | undefined): unknown {
  if (!node) return null
  const attrs = Object.fromEntries(
    Object.entries(node.attrs)
      .filter(([k]) => !k.startsWith('xmlns'))
      .map(([k, v]) => [k, v === 'true' ? '1' : v === 'false' ? '0' : v])
      .sort(([a], [b]) => a.localeCompare(b))
  )
  const isFlag =
    Object.keys(attrs).length === 1 && 'val' in attrs && (attrs.val === '1' || attrs.val === '0')
  const kids = node.children
    .map(canonical)
    .filter((c) => !(c && typeof c === 'object' && 'off' in c))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  if (isFlag) return attrs.val === '1' ? { [node.name]: true } : { off: true }
  if (Object.keys(attrs).length === 0 && kids.length === 0) return { [node.name]: true }
  return { [node.name]: { ...attrs, ...(kids.length ? { children: kids } : {}) } }
}

/** Numeric attributes compared as numbers, so "10" and "10.0" match. */
const num = (v: string | undefined): number | null => (v === undefined ? null : Number(v))

const builtinNumFmt = (id: string): string => `builtin:${id}`

export interface XlsxSnapshot {
  sheetName: string
  merges: string[]
  cols: { min: number; max: number; width: number | null; hidden: boolean; style: unknown }[]
  rows: { r: number; ht: number | null; customHeight: boolean; hidden: boolean }[]
  defaultRowHeight: number | null
  /** Resolved style of every cell written in the sheet. */
  styles: Record<string, unknown>
  values: Record<string, string>
  sheetPr: unknown
  sheetView: Record<string, string>
  pageSetup: Record<string, number | string>
  pageMargins: Record<string, number>
  printOptions: Record<string, string>
  printArea: string | null
  images: {
    sha256: string
    from: unknown
    to: unknown
    ext: unknown
    editAs: string | null
  }[]
}

function read(zip: PizZip, path: string): XmlNode {
  const file = zip.file(path)
  if (!file) throw new Error(`missing ${path}`)
  return parseXml(file.asText())
}

function rels(zip: PizZip, partPath: string): Record<string, string> {
  const dir = posix.dirname(partPath)
  const relsPath = posix.join(dir, '_rels', `${posix.basename(partPath)}.rels`)
  if (!zip.file(relsPath)) return {}
  const out: Record<string, string> = {}
  for (const r of children(child(read(zip, relsPath), 'Relationships'), 'Relationship')) {
    out[r.attrs.Id] = posix.normalize(
      r.attrs.Target.startsWith('/') ? r.attrs.Target.slice(1) : posix.join(dir, r.attrs.Target)
    )
  }
  return out
}

const intAttrs = (node: XmlNode | undefined): Record<string, number> =>
  Object.fromEntries(Object.entries(node?.attrs ?? {}).map(([k, v]) => [k, Number(v)]))

/** The first worksheet of an .xlsx, as a snapshot. */
export function snapshotXlsx(buffer: Buffer | Uint8Array): XlsxSnapshot {
  const zip = new PizZip(buffer)
  const workbook = child(read(zip, 'xl/workbook.xml'), 'workbook')
  const sheet = children(child(workbook, 'sheets'), 'sheet')[0]
  const sheetRid = Object.entries(sheet.attrs).find(([k]) => local(k) === 'id')?.[1] ?? ''
  const sheetPath = rels(zip, 'xl/workbook.xml')[sheetRid]
  const ws = child(read(zip, sheetPath), 'worksheet')
  if (!ws) throw new Error('no worksheet')

  // Styles, resolved.
  const ss = child(read(zip, 'xl/styles.xml'), 'styleSheet')
  const numFmts = Object.fromEntries(
    children(child(ss, 'numFmts'), 'numFmt').map((n) => [n.attrs.numFmtId, n.attrs.formatCode])
  )
  const fonts = children(child(ss, 'fonts'), 'font')
  const fills = children(child(ss, 'fills'), 'fill')
  const borders = children(child(ss, 'borders'), 'border')
  const xfs = children(child(ss, 'cellXfs'), 'xf')
  const resolveStyle = (s: string | undefined): unknown => {
    const xf = xfs[Number(s ?? 0)]
    if (!xf) return null
    const fmtId = xf.attrs.numFmtId ?? '0'
    return {
      numFmt: numFmts[fmtId] ?? builtinNumFmt(fmtId),
      font: canonical(fonts[Number(xf.attrs.fontId ?? 0)]),
      fill: canonical(fills[Number(xf.attrs.fillId ?? 0)]),
      border: canonical(borders[Number(xf.attrs.borderId ?? 0)]),
      alignment: canonical(child(xf, 'alignment')),
      protection: canonical(child(xf, 'protection'))
    }
  }

  const styles: Record<string, unknown> = {}
  const values: Record<string, string> = {}
  const rows: XlsxSnapshot['rows'] = []
  for (const row of children(child(ws, 'sheetData'), 'row')) {
    rows.push({
      r: Number(row.attrs.r),
      ht: num(row.attrs.ht),
      customHeight: row.attrs.customHeight === '1' || row.attrs.customHeight === 'true',
      hidden: row.attrs.hidden === '1' || row.attrs.hidden === 'true'
    })
    for (const c of children(row, 'c')) {
      styles[c.attrs.r] = resolveStyle(c.attrs.s)
      const text =
        c.attrs.t === 'inlineStr' ? allText(child(c, 'is')!) : (child(c, 'v')?.text ?? '')
      if (text !== '') values[c.attrs.r] = text
    }
  }

  // Shared strings, if the writer used them.
  if (zip.file('xl/sharedStrings.xml')) {
    const sst = children(child(read(zip, 'xl/sharedStrings.xml'), 'sst'), 'si').map(allText)
    for (const row of children(child(ws, 'sheetData'), 'row')) {
      for (const c of children(row, 'c')) {
        if (c.attrs.t === 's') values[c.attrs.r] = sst[Number(child(c, 'v')?.text)]
      }
    }
  }

  const cols = children(child(ws, 'cols'), 'col').map((c) => ({
    min: Number(c.attrs.min),
    max: Number(c.attrs.max),
    width: num(c.attrs.width),
    hidden: c.attrs.hidden === '1' || c.attrs.hidden === 'true',
    style: resolveStyle(c.attrs.style)
  }))

  const printArea =
    children(child(workbook, 'definedNames'), 'definedName').find(
      (d) => d.attrs.name === '_xlnm.Print_Area'
    )?.text ?? null

  // Images: bytes and anchor of every picture in the sheet's drawing.
  const images: XlsxSnapshot['images'] = []
  const drawingRid = Object.entries(child(ws, 'drawing')?.attrs ?? {}).find(
    ([k]) => local(k) === 'id'
  )?.[1]
  if (drawingRid) {
    const drawingPath = rels(zip, sheetPath)[drawingRid]
    const drawingRels = rels(zip, drawingPath)
    const wsDr = child(read(zip, drawingPath), 'wsDr')
    for (const anchor of wsDr?.children ?? []) {
      const pic = child(anchor, 'pic')
      if (!pic) continue
      const blip = child(child(pic, 'blipFill'), 'blip')
      const embed = Object.entries(blip?.attrs ?? {}).find(([k]) => local(k) === 'embed')?.[1]
      const media = zip.file(drawingRels[embed ?? ''])?.asUint8Array()
      if (!media) throw new Error('image part missing')
      const marker = (m: XmlNode | undefined): unknown =>
        m && Object.fromEntries(m.children.map((c) => [c.name, Number(c.text)]))
      images.push({
        sha256: createHash('sha256').update(media).digest('hex'),
        from: marker(child(anchor, 'from')),
        to: marker(child(anchor, 'to')),
        ext:
          canonical(child(anchor, 'ext')) ??
          canonical(child(child(child(pic, 'spPr'), 'xfrm'), 'ext')),
        editAs: anchor.attrs.editAs ?? null
      })
    }
  }

  const pageSetup = Object.fromEntries(
    Object.entries(child(ws, 'pageSetup')?.attrs ?? {})
      .filter(([k]) => !k.includes(':') && k !== 'horizontalDpi' && k !== 'verticalDpi')
      .map(([k, v]) => [k, /^\d+(\.\d+)?$/.test(v) ? Number(v) : v])
  )

  return {
    sheetName: sheet.attrs.name,
    merges: children(child(ws, 'mergeCells'), 'mergeCell')
      .map((m) => m.attrs.ref)
      .sort(),
    cols,
    rows,
    defaultRowHeight: num(child(ws, 'sheetFormatPr')?.attrs.defaultRowHeight),
    styles,
    values,
    sheetPr: canonical(child(ws, 'sheetPr')),
    sheetView: Object.fromEntries(
      Object.entries(child(child(ws, 'sheetViews'), 'sheetView')?.attrs ?? {}).filter(
        ([k]) => k === 'rightToLeft' || k === 'view' || k === 'zoomScale'
      )
    ),
    pageSetup,
    pageMargins: intAttrs(child(ws, 'pageMargins')),
    printOptions: child(ws, 'printOptions')?.attrs ?? {},
    printArea,
    images
  }
}

export interface SheetCell {
  /** Cell type as written: 'n' (number, the default), 'inlineStr', 's'… */
  t: string
  s: string | undefined
  text: string
  /** The parsed `<c>` element, for exact comparisons. */
  node: XmlNode
}

/** Every `<c>` of sheet1.xml by reference, plus the row numbers and each row's cell order. */
export function sheetCells(buffer: Buffer | Uint8Array): {
  cells: Record<string, SheetCell>
  rows: { r: number; refs: string[] }[]
} {
  const ws = child(read(new PizZip(buffer), 'xl/worksheets/sheet1.xml'), 'worksheet')
  const cells: Record<string, SheetCell> = {}
  const rows = children(child(ws, 'sheetData'), 'row').map((row) => {
    const refs = children(row, 'c').map((c) => {
      const text =
        c.attrs.t === 'inlineStr' ? allText(child(c, 'is')!) : (child(c, 'v')?.text ?? '')
      cells[c.attrs.r] = { t: c.attrs.t ?? 'n', s: c.attrs.s, text, node: c }
      return c.attrs.r
    })
    return { r: Number(row.attrs.r), refs }
  })
  return { cells, rows }
}
