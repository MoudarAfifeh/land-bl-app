import { describe, expect, it } from 'vitest'
import type { DocumentView } from '@shared/api'
import { exportSlots } from '@shared/fields'
import { exportCells, wordData, wordText } from './export-data'
import { longDocument, sampleDocument } from './test-fixtures'

const LRM = '\u200E'
const agents = { customsAgent1: 'المخلص السوري\r\nسطر ٢', customsAgent2: null }

function view(overrides: Partial<DocumentView> = {}): DocumentView {
  return { ...sampleDocument(1), id: 1, serialNo: 'A00001', deletedAt: null, ...overrides }
}

const valueOf = (cells: ReturnType<typeof exportCells>, key: string): unknown =>
  cells.find((c) => c.key === key)?.value

describe('exportCells', () => {
  it('gives every export slot a value, in slot order', () => {
    expect(exportCells(view(), agents).map((c) => c.key)).toEqual(exportSlots().map((s) => s.key))
  })

  it('writes dates as DD/MM/YYYY text and numbers as numbers', () => {
    const cells = exportCells(view({ ...longDocument, vesselId: 1 }), agents)
    expect(valueOf(cells, 'issueDate')).toBe('27/09/2026')
    expect(valueOf(cells, 'supplyOrderDate')).toBe('20/09/2026')
    expect(valueOf(cells, 'qtyNaturalL')).toBe(36123.456)
    expect(valueOf(cells, 'flashPoint')).toBe(-43)
    expect(valueOf(cells, 'serialNo')).toBe('A00001')
  })

  it('leaves empty values null', () => {
    const cells = exportCells(
      view({ weightKg: null, shipperAddress: '  ', passportNo: null }),
      agents
    )
    expect(valueOf(cells, 'weightKg')).toBeNull()
    expect(valueOf(cells, 'shipperAddress')).toBeNull()
    expect(valueOf(cells, 'passportNo')).toBeNull()
    expect(valueOf(cells, 'customsAgent2')).toBeNull()
  })

  it('fills seals in order, skipping blanks, and leaves the rest empty', () => {
    const cells = exportCells(view({ seals: ['S1', ' ', 'S2'] }), agents)
    expect(valueOf(cells, 'seal1')).toBe('S1')
    expect(valueOf(cells, 'seal2')).toBe('S2')
    expect(valueOf(cells, 'seal3')).toBeNull()
    expect(valueOf(cells, 'seal12')).toBeNull()
  })

  it('keeps agent line breaks as \n', () => {
    expect(valueOf(exportCells(view(), agents), 'customsAgent1')).toBe('المخلص السوري\nسطر ٢')
  })
})

describe('wordText', () => {
  it('marks lines that read left to right: numbers, dates, codes, Latin text', () => {
    for (const t of ['-43', '27/09/2026', 'SEAL-00123', '0.7456', 'Al-Rafidain LLC']) {
      expect(wordText(t)).toBe(`${LRM}${t}${LRM}`)
    }
  })

  it('leaves Arabic-first lines as they are, line by line', () => {
    expect(wordText('بغداد 123456 أ / 654321')).toBe('بغداد 123456 أ / 654321')
    // Digits first, but the first letter is Arabic: right to left, like dir="auto".
    expect(wordText('12 شارع')).toBe('12 شارع')
    expect(wordText('المخلص\n00963-933-351758')).toBe(`المخلص\n${LRM}00963-933-351758${LRM}`)
  })
})

describe('wordData', () => {
  it('turns every value into a string, empty for null', () => {
    const data = wordData(exportCells(view({ weightKg: null, qtyNaturalL: 36000 }), agents))
    expect(data.weightKg).toBe('')
    expect(data.qtyNaturalL).toBe(`${LRM}36000${LRM}`)
    expect(Object.values(data).every((v) => typeof v === 'string')).toBe(true)
  })
})
