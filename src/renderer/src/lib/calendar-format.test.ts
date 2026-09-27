import { describe, expect, it } from 'vitest'
import { calendarFormatters, calendarLabels, dateToIso, isoToDate } from './calendar-format'

const ARABIC_INDIC = /[٠-٩۰-۹]/

describe('calendar text', () => {
  const f = calendarFormatters as Required<typeof calendarFormatters>
  const jan = new Date(2026, 0, 27)

  it('writes the header with Levantine month names and Latin digits', () => {
    const header = f.formatCaption(jan)
    expect(header).toBe('كانون الثاني 2026')
    expect(header).not.toMatch(ARABIC_INDIC)
    expect(f.formatYearDropdown(jan)).toBe('2026')
  })

  it('uses Levantine names for every month', () => {
    const months = Array.from({ length: 12 }, (_, i) => f.formatMonthDropdown(new Date(2026, i, 1)))
    expect(months).toEqual([
      'كانون الثاني',
      'شباط',
      'آذار',
      'نيسان',
      'أيار',
      'حزيران',
      'تموز',
      'آب',
      'أيلول',
      'تشرين الأول',
      'تشرين الثاني',
      'كانون الأول'
    ])
  })

  it('writes days and screen-reader dates with Latin digits', () => {
    expect(f.formatDay(jan)).toBe('27')
    const label = calendarLabels.labelDayButton!(jan, { today: true, selected: true } as never)
    expect(label).toBe('اليوم، الثلاثاء، 27 كانون الثاني 2026، محدد')
    expect(label).not.toMatch(ARABIC_INDIC)
  })

  it('starts the week header on Saturday with one-letter names', () => {
    expect(f.formatWeekdayName(new Date(2026, 0, 31))).toBe('س') // a Saturday
  })
})

describe('ISO ↔ calendar day', () => {
  it('converts both ways in local time', () => {
    const d = isoToDate('2026-09-27')!
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 8, 27, 0])
    expect(dateToIso(d)).toBe('2026-09-27')
  })

  it('rejects text that is not a real ISO date', () => {
    expect(isoToDate('')).toBeNull()
    expect(isoToDate('27/09/2026')).toBeNull()
    expect(isoToDate('2026-02-31')).toBeNull()
  })
})
