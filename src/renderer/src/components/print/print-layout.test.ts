import { describe, expect, it } from 'vitest'
import { documentFields, settingFields } from '@shared/fields'
import { COLUMN_COUNT, PLACED_CELLS, PRINT_ROWS, ROW_HEIGHTS, placeCells } from './print-layout'

/** An Excel address (column letter + row number) → 1-based column and row. */
function position(address: string): { col: number; row: number } {
  const m = /^([A-Z])(\d+)$/.exec(address)
  if (!m) throw new Error(`bad address ${address}`)
  return { col: m[1].charCodeAt(0) - 64, row: Number(m[2]) }
}

function at(cell: { col: number; row: number }): { col: number; row: number } {
  return { col: cell.col, row: cell.row }
}

describe('print layout', () => {
  it('covers the template: 50 rows of 7 columns, each cell exactly once', () => {
    expect(PRINT_ROWS).toHaveLength(50)
    expect(ROW_HEIGHTS).toHaveLength(50)
    expect(COLUMN_COUNT).toBe(7)
    const area = PLACED_CELLS.reduce((sum, c) => sum + c.colSpan * c.rowSpan, 0)
    expect(area).toBe(50 * 7)
  })

  it('puts every printed value on its Excel cell from fields.ts', () => {
    for (const f of documentFields) {
      const values = PLACED_CELLS.filter(
        (c) => c.content.kind === 'value' && c.content.field === f.key
      )
      if (!f.print || f.type === 'stringList') {
        expect(values, f.key).toHaveLength(0)
        continue
      }
      expect(values, f.key).toHaveLength(1)
      expect(at(values[0]), f.key).toEqual(position(f.excel as string))
    }
  })

  it('puts the 12 seals on the seal cells, in order', () => {
    const seals = documentFields.find((f) => f.key === 'seals')!
    const cells = PLACED_CELLS.filter((c) => c.content.kind === 'seal')
    expect(cells).toHaveLength(12)
    for (const cell of cells) {
      const index = (cell.content as { index: number }).index
      expect(at(cell), `seal ${index + 1}`).toEqual(position((seals.excel as string[])[index]))
    }
  })

  it('puts the customs agents on their cells from settings', () => {
    for (const f of settingFields) {
      const cells = PLACED_CELLS.filter(
        (c) => c.content.kind === 'agent' && c.content.key === f.key
      )
      if (!f.excel) {
        expect(cells, f.key).toHaveLength(0)
        continue
      }
      expect(cells, f.key).toHaveLength(1)
      expect(at(cells[0])).toEqual(position(f.excel))
    }
  })

  it('labels every printed field', () => {
    const labelled = new Set(
      PLACED_CELLS.flatMap((c) => (c.content.kind === 'label' ? [c.content.field] : []))
    )
    for (const f of documentFields) {
      if (f.print) expect(labelled.has(f.key as never), f.key).toBe(true)
    }
  })

  it('lets text spill only over blank cells without an inner border', () => {
    for (const cell of PLACED_CELLS.filter((c) => c.spillLeft)) {
      for (let col = cell.col - cell.spillLeft!; col < cell.col; col++) {
        const under = PLACED_CELLS.find(
          (c) => c.row === cell.row && c.col === col && c.rowSpan === cell.rowSpan
        )
        expect(under?.content.kind, `row ${cell.row}`).toBe('blank')
        expect(under?.right, `row ${cell.row}`).toBe('none')
      }
    }
  })

  it('rejects rows that are short, too long or overlapping', () => {
    const cell = { content: { kind: 'blank' as const } }
    expect(() => placeCells([[cell]])).toThrow(/not full/)
    expect(() => placeCells([[{ ...cell, colSpan: 8 }]])).toThrow(/overflows/)
    expect(() => placeCells([[{ ...cell, colSpan: 7, rowSpan: 2 }], [cell]])).toThrow(
      /overflows|overlap/
    )
  })
})
