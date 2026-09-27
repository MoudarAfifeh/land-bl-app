/**
 * Parsing and display of dates and numbers typed in the form.
 * Dates show as DD/MM/YYYY and are stored as ISO YYYY-MM-DD (see field-map.md, Formats).
 */

const pad = (n: number): string => String(n).padStart(2, '0')

/** Arabic-Indic and Persian digits (and the Arabic decimal mark) typed on an Arabic keyboard. */
export function toLatinDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
}

/** Today in local time, as ISO. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** ISO → DD/MM/YYYY. Anything that isn't an ISO date is returned as is. */
export function isoToDisplay(value: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (value ?? '')
}

/** D/M/YYYY (with /, - or . as separator) → ISO, or null if it isn't a real date. */
export function displayToIso(text: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(toLatinDigits(text).trim())
  if (!m) return null
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/**
 * Form value of a typed number: null when blank, NaN when not a plain number (the schema then
 * shows "يجب إدخال رقم"). No thousands separators, no exponents.
 */
export function parseNumber(text: string): number | null {
  const t = toLatinDigits(text).trim()
  if (t === '') return null
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN
}

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? '' : String(value)
}

/** A stored or typed value as the printed document shows it (print view, Excel text, Word). */
export function displayValue(type: string, v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  if (type === 'date') return isoToDisplay(String(v))
  if (type === 'number') return typeof v === 'number' ? formatNumber(v) : String(v).trim()
  return String(v).trim()
}
