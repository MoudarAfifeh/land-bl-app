import { describe, expect, it } from 'vitest'
import { differsFromStored, findByName, nameKey, nextStoredValue, normalizeName } from './lookups'

describe('name matching', () => {
  it('trims and collapses spaces', () => {
    expect(normalizeName('  شركة   الحسن \t للنقل ')).toBe('شركة الحسن للنقل')
  })

  it('ignores case and extra spaces when comparing', () => {
    expect(nameKey(' Al  Hasan Co ')).toBe(nameKey('al hasan co'))
    const items = [{ name: 'Al Hasan Co' }, { name: 'شركة الحسن' }]
    expect(findByName(items, (i) => i.name, 'AL HASAN  co')).toBe(items[0])
    expect(findByName(items, (i) => i.name, ' شركة  الحسن')).toBe(items[1])
    expect(findByName(items, (i) => i.name, 'other')).toBeUndefined()
    expect(findByName(items, (i) => i.name, '   ')).toBeUndefined()
  })
})

describe('stored value conflicts', () => {
  it('is a conflict only when both sides have different values', () => {
    expect(differsFromStored('دمشق', 'بغداد')).toBe(true)
    expect(differsFromStored(' دمشق ', 'دمشق')).toBe(false)
    expect(differsFromStored('', 'بغداد')).toBe(false)
    expect(differsFromStored('دمشق', null)).toBe(false)
  })

  it('fills a blank, replaces only when asked, never clears', () => {
    expect(nextStoredValue('دمشق', null, false)).toBe('دمشق')
    expect(nextStoredValue('دمشق', 'بغداد', false)).toBeUndefined()
    expect(nextStoredValue('دمشق', 'بغداد', true)).toBe('دمشق')
    expect(nextStoredValue('دمشق', 'دمشق', true)).toBeUndefined()
    expect(nextStoredValue(null, 'بغداد', true)).toBeUndefined()
  })
})
