import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  documentFields,
  documentInputFields,
  exportSlots,
  settingFields,
  stepFieldKeys,
  MAX_SEALS,
  SEAL_KEYS,
  WIZARD_STEPS
} from './fields'

const allExportedCells = [...documentFields, ...settingFields].flatMap((f) =>
  f.excel === null ? [] : typeof f.excel === 'string' ? [f.excel] : [...f.excel]
)

describe('fields', () => {
  it('has unique keys', () => {
    const keys = documentFields.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('never maps two values to the same Excel cell', () => {
    expect(new Set(allExportedCells).size).toBe(allExportedCells.length)
  })

  it('lists the 12 seal cells in template order', () => {
    const seals = documentFields.find((f) => f.key === 'seals')!
    expect(seals.excel).toEqual([
      'A15', 'C15', 'E15', 'A16', 'C16', 'E16', 'A17', 'C17', 'E17', 'A18', 'C18', 'E18'
    ]) // prettier-ignore
    expect(seals.max).toBe(MAX_SEALS)
  })

  it('does not print or export the vessel', () => {
    const vessel = documentFields.find((f) => f.key === 'vesselId')!
    expect(vessel.excel).toBeNull()
    expect(vessel.print).toBe(false)
  })

  it('excludes the auto-assigned serial from user input', () => {
    expect(documentInputFields.map((f) => f.key)).not.toContain('serialNo')
  })

  it('gives every wizard field a step and every exported field an Excel cell', () => {
    for (const f of documentFields) {
      expect(f.step, f.key).toBeDefined()
      if (f.print) expect(f.excel, f.key).not.toBeNull()
    }
  })
})

describe('export slots', () => {
  const slots = exportSlots()

  it('covers every printed field, the 12 seals and both agents, each in its own cell', () => {
    const printed = documentFields.filter((f) => f.print && f.key !== 'seals').map((f) => f.key)
    expect(slots.map((s) => s.key).sort()).toEqual(
      [...printed, ...SEAL_KEYS, 'customsAgent1', 'customsAgent2'].sort()
    )
    expect(new Set(slots.map((s) => s.cell)).size).toBe(slots.length)
    expect(new Set(slots.map((s) => s.cell))).toEqual(new Set(allExportedCells))
  })

  it('puts seal1..seal12 in the seal cells, in order', () => {
    const seals = documentFields.find((f) => f.key === 'seals')!
    expect(slots.filter((s) => s.key.startsWith('seal')).map((s) => s.cell)).toEqual(seals.excel)
    expect(SEAL_KEYS[0]).toBe('seal1')
    expect(SEAL_KEYS[11]).toBe('seal12')
  })

  it('keeps the field type for numbers and dates', () => {
    const typeOf = (key: string): string | undefined => slots.find((s) => s.key === key)?.type
    expect(typeOf('qtyNaturalL')).toBe('number')
    expect(typeOf('issueDate')).toBe('date')
    expect(typeOf('customsAgent1')).toBe('string')
  })
})

describe('no Excel cell address outside fields.ts', () => {
  const srcRoot = join(__dirname, '..')
  const allowed = new Set([join('shared', 'fields.ts'), join('shared', 'fields.test.ts')])

  function* sourceFiles(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) {
        if (name !== 'migrations') yield* sourceFiles(path)
      } else if (/\.(ts|tsx)$/.test(name)) yield path
    }
  }

  it('finds none of the mapped cells in quotes anywhere else', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(srcRoot)) {
      const rel = relative(srcRoot, file)
      if (allowed.has(rel)) continue
      const text = readFileSync(file, 'utf8')
      for (const cell of allExportedCells) {
        if (new RegExp(`['"\`]${cell}['"\`]`).test(text))
          offenders.push(`${rel.split(sep).join('/')}: ${cell}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('wizard steps', () => {
  it('puts every input field on exactly one step, never the serial', () => {
    const keys = WIZARD_STEPS.flatMap((s) => stepFieldKeys(s))
    expect(keys).toEqual(documentInputFields.map((f) => f.key))
    expect(keys).not.toContain('serialNo')
    expect(stepFieldKeys(1)).toEqual([
      'vesselId',
      'issueDate',
      'shipperName',
      'shipperAddress',
      'consigneeName',
      'consigneeAddress'
    ])
  })
})
