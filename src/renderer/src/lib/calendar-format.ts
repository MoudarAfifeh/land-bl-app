/**
 * Calendar text in Levantine Arabic (كانون الثاني، شباط، آذار…), as used in Syria and Iraq, with
 * Latin digits to match DD/MM/YYYY everywhere else. Plain 'ar-SY' would write the year as ٢٠٢٦.
 */
import type { Formatters, Labels } from 'react-day-picker'
import { ar } from 'react-day-picker/locale'
import { todayIso } from '@shared/format'

export const CALENDAR_LOCALE = 'ar-SY-u-nu-latn'

const format = (options: Intl.DateTimeFormatOptions): ((d: Date) => string) => {
  const f = new Intl.DateTimeFormat(CALENDAR_LOCALE, options)
  return (d) => f.format(d)
}

const monthYear = format({ month: 'long', year: 'numeric' })
const monthName = format({ month: 'long' })
const yearNumber = format({ year: 'numeric' })
const weekdayNarrow = format({ weekday: 'narrow' })
const weekdayLong = format({ weekday: 'long' })
const fullDate = format({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** Everything the calendar shows. */
export const calendarFormatters: Partial<Formatters> = {
  formatCaption: monthYear,
  formatMonthDropdown: monthName,
  formatYearDropdown: yearNumber,
  formatWeekdayName: weekdayNarrow,
  formatDay: (d) => String(d.getDate())
}

/** What screen readers say, in the same Arabic as the visible text. */
export const calendarLabels: Partial<Labels> = {
  labelGrid: monthYear,
  labelWeekday: weekdayLong,
  labelDayButton: (d, modifiers) =>
    [modifiers.today ? 'اليوم' : '', fullDate(d), modifiers.selected ? 'محدد' : '']
      .filter(Boolean)
      .join('، '),
  labelGridcell: (d, modifiers) => (modifiers?.today ? `اليوم، ${fullDate(d)}` : fullDate(d))
}

/** Arabic navigation labels («الشهر التالي»…); dates are formatted by the two objects above. */
export const calendarLocale = ar

/** Saturday, as in Syria and Iraq. */
export const WEEK_STARTS_ON = 6

/** ISO YYYY-MM-DD → local date at midnight, or null. */
export function isoToDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return date.getDate() === Number(m[3]) ? date : null
}

/** A picked calendar day (local midnight) → ISO. */
export const dateToIso = todayIso
