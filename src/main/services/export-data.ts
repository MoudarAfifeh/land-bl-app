/**
 * The values that go into the Excel and Word templates, one per export slot of fields.ts: the
 * same text as the print view, except that Excel gets numbers as numbers.
 */
import type { DocumentView } from '@shared/api'
import { exportSlots, SEAL_KEYS, type ExportSlot } from '@shared/fields'
import { displayValue, formatNumber } from '@shared/format'

/** A slot and its value; null = empty. Dates are DD/MM/YYYY text. */
export interface ExportCell extends ExportSlot {
  value: string | number | null
}

/** The agent blocks come from the document's own copy, never from the current settings. */
export function exportCells(doc: DocumentView): ExportCell[] {
  const seals = doc.seals.map((s) => s.trim()).filter(Boolean)
  const source: Record<string, unknown> = {
    ...doc,
    ...Object.fromEntries(SEAL_KEYS.map((key, i) => [key, seals[i] ?? null]))
  }
  return exportSlots().map((slot) => {
    const v = source[slot.key]
    if (slot.type === 'number') {
      return { ...slot, value: typeof v === 'number' && Number.isFinite(v) ? v : null }
    }
    const text = displayValue(slot.type, typeof v === 'string' ? v : null).replace(/\r\n?/g, '\n')
    return { ...slot, value: text === '' ? null : text }
  })
}

const LRM = '\u200E'

/** First strong letter: group 1 is set when it is right-to-left (Arabic, Hebrew…). */
const firstStrong =
  /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]|([\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC])/

/**
 * Word has no `dir="auto"`, and every template cell is an RTL paragraph, so "-43" would show
 * as "43-". Like the print view, a line that doesn't start with an Arabic letter (numbers,
 * dates, seal codes, Latin names) reads left to right: it is wrapped in LRM marks.
 */
export function wordText(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (line === '') return line
      const m = firstStrong.exec(line)
      return m && m[1] !== undefined ? line : `${LRM}${line}${LRM}`
    })
    .join('\n')
}

/** Data for docxtemplater: every placeholder gets a string, empty values are ''. */
export function wordData(cells: readonly ExportCell[]): Record<string, string> {
  return Object.fromEntries(
    cells.map(({ key, value }) => [
      key,
      value === null ? '' : wordText(typeof value === 'number' ? formatNumber(value) : value)
    ])
  )
}
