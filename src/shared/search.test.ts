import { describe, expect, it } from 'vitest'
import { escapeLike, normalizeSearch, searchText, searchTokens } from './search'

describe('normalizeSearch', () => {
  it('trims, collapses spaces and lowercases Latin text', () => {
    expect(normalizeSearch('  SEAL-2026   Abc ')).toBe('seal-2026 abc')
  })

  it('unifies alef, ya, ta marbuta and hamza carriers', () => {
    expect(normalizeSearch('أحمد إبراهيم آمال ٱلله')).toBe('احمد ابراهيم امال الله')
    expect(normalizeSearch('مصطفى')).toBe(normalizeSearch('مصطفي'))
    expect(normalizeSearch('شركة')).toBe(normalizeSearch('شركه'))
    expect(normalizeSearch('مؤسسة')).toBe('موسسه')
    expect(normalizeSearch('هيئة')).toBe('هييه')
  })

  it('removes tashkeel and tatweel', () => {
    expect(normalizeSearch('مُحَمَّد')).toBe('محمد')
    expect(normalizeSearch('بـــغداد')).toBe('بغداد')
    expect(normalizeSearch('\u0645\u0670\u0646')).toBe('من')
  })

  it('turns Arabic-Indic and Persian digits into Latin', () => {
    expect(normalizeSearch('١٢٣٤٥٦ ۷۸۹')).toBe('123456 789')
  })
})

describe('searchTokens', () => {
  it('splits the normalised query into words, dropping empties', () => {
    expect(searchTokens('  محمد   الجبوري ')).toEqual(['محمد', 'الجبوري'])
    expect(searchTokens('   ')).toEqual([])
  })
})

describe('searchText', () => {
  it('puts each field on its own line, normalised, skipping empty ones', () => {
    expect(
      searchText({
        serialNo: 'A00001',
        driverName: 'أحمد',
        tankerNo: '١٢٣',
        shipperName: 'شركة',
        consigneeName: ''
      })
    ).toBe('a00001\nاحمد\n123\nشركه')
  })
})

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('50%_a!b')).toBe('50!%!_a!!b')
  })
})
