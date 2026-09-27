import { describe, expect, it } from 'vitest'
import {
  displayToIso,
  formatDateTime,
  isoToDisplay,
  parseNumber,
  toLatinDigits,
  todayIso
} from './format'

describe('dates', () => {
  it('shows ISO dates as DD/MM/YYYY', () => {
    expect(isoToDisplay('2026-09-27')).toBe('27/09/2026')
    expect(isoToDisplay('')).toBe('')
    expect(isoToDisplay(null)).toBe('')
    expect(isoToDisplay('27/09')).toBe('27/09')
  })

  it('parses typed dates into ISO', () => {
    expect(displayToIso('27/09/2026')).toBe('2026-09-27')
    expect(displayToIso('7/9/2026')).toBe('2026-09-07')
    expect(displayToIso(' 07-09-2026 ')).toBe('2026-09-07')
    expect(displayToIso('٢٧/٠٩/٢٠٢٦')).toBe('2026-09-27')
  })

  it('rejects impossible or partial dates', () => {
    expect(displayToIso('31/02/2026')).toBeNull()
    expect(displayToIso('27/13/2026')).toBeNull()
    expect(displayToIso('27/09')).toBeNull()
    expect(displayToIso('2026-09-27')).toBeNull()
  })

  it('gives today in local time', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})

describe('numbers', () => {
  it('converts Arabic digits and decimal mark', () => {
    expect(toLatinDigits('٣٦٠٠٠٫٥')).toBe('36000.5')
    expect(toLatinDigits('۱۲')).toBe('12')
  })

  it('parses blanks as null and junk as NaN', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('  ')).toBeNull()
    expect(parseNumber(' 36000 ')).toBe(36000)
    expect(parseNumber('0.7415')).toBe(0.7415)
    expect(parseNumber('٠٫٧٤')).toBe(0.74)
    expect(parseNumber('-5')).toBe(-5)
    expect(parseNumber('36,000')).toBeNaN()
    expect(parseNumber('1e3')).toBeNaN()
    expect(parseNumber('abc')).toBeNaN()
  })
})

describe('formatDateTime', () => {
  it('shows a timestamp in local time as DD/MM/YYYY HH:mm', () => {
    expect(formatDateTime(new Date(2026, 8, 7, 9, 5).toISOString())).toBe('07/09/2026 09:05')
    expect(formatDateTime('nope')).toBe('nope')
  })
})
