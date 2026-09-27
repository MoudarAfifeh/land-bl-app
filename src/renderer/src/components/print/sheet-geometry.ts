/**
 * Size of the printed sheet. The template prints on A4 with 0.4" / 0.3" margins (see @page in
 * print.css), scaled so its 50 rows fill the printable height, like Excel's "fit to one page".
 */
import { COLUMN_WIDTHS, ROW_HEIGHTS } from './print-layout'

/** The printable height is 276.7mm; the rest is slack so rounding never spills onto page 2. */
export const SHEET_HEIGHT_MM = 275

const PT_TO_MM = 25.4 / 72
const PX_TO_MM = 25.4 / 96
const totalRowPt = ROW_HEIGHTS.reduce((a, b) => a + b, 0)
const scale = SHEET_HEIGHT_MM / (totalRowPt * PT_TO_MM)

export const ROWS_MM = ROW_HEIGHTS.map((pt) => pt * PT_TO_MM * scale)
/** Excel column width in characters → pixels (7px per character + 5px padding) → mm. */
export const COLUMNS_MM = COLUMN_WIDTHS.map((chars) => (chars * 7 + 5) * PX_TO_MM * scale)
export const SHEET_WIDTH_MM = COLUMNS_MM.reduce((a, b) => a + b, 0)
export const SHEET_WIDTH_PX = SHEET_WIDTH_MM / PX_TO_MM
