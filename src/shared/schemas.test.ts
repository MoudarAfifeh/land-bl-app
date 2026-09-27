import { describe, expect, it } from 'vitest'
import { documentInputSchema, messages, vesselInputSchema } from './schemas'

const valid = {
  vesselId: 1,
  issueDate: '2026-09-27',
  shipperName: 'شركة المرسل',
  shipperAddress: '',
  consigneeName: 'شركة المستلم',
  consigneeAddress: 'بغداد',
  product: 'بنزين/ Gasoline',
  qtyNaturalL: 36000,
  qtyStandardL: '',
  weightKg: null,
  barrels: 226.4,
  seals: ['1001', '', ' 1002 '],
  density15: 0.745,
  octane: 95,
  flashPoint: null,
  temperature: 31,
  vcf: 0.9812,
  meterFactor: 1,
  crossingNo: '',
  supplyOfficerName: '',
  supplyOfficerTitle: '',
  missionNo: '',
  supplyOrderNo: '',
  supplyOrderDate: '',
  tankerNo: '123456',
  driverName: 'سائق',
  passportNo: 'N123',
  carrierRep: '',
  transportDate: '2026-09-27'
}

describe('documentInputSchema', () => {
  it('accepts a valid document and normalises blanks', () => {
    const doc = documentInputSchema.parse(valid)
    expect(doc.shipperAddress).toBeNull()
    expect(doc.qtyStandardL).toBeNull()
    expect(doc.supplyOrderDate).toBeNull()
    expect(doc.seals).toEqual(['1001', '1002'])
  })

  it('rejects missing required fields with an Arabic message', () => {
    const r = documentInputSchema.safeParse({ ...valid, shipperName: '  ', tankerNo: '' })
    expect(r.success).toBe(false)
    const issues = r.error!.issues.map((i) => [i.path.join('.'), i.message])
    expect(issues).toContainEqual(['shipperName', messages.required])
    expect(issues).toContainEqual(['tankerNo', messages.required])
  })

  it('requires a vessel', () => {
    expect(documentInputSchema.safeParse({ ...valid, vesselId: null }).success).toBe(false)
  })

  it('rejects more than 12 seals', () => {
    const seals = Array.from({ length: 13 }, (_, i) => String(i + 1))
    expect(documentInputSchema.safeParse({ ...valid, seals }).success).toBe(false)
  })

  it('rejects invalid dates', () => {
    expect(documentInputSchema.safeParse({ ...valid, issueDate: '27/09/2026' }).success).toBe(false)
    expect(documentInputSchema.safeParse({ ...valid, issueDate: '2026-02-30' }).success).toBe(false)
  })

  it('rejects text in number fields', () => {
    expect(documentInputSchema.safeParse({ ...valid, octane: 'abc' }).success).toBe(false)
  })
})

describe('vesselInputSchema', () => {
  it('uppercases a single-letter prefix', () => {
    const v = vesselInputSchema.parse({
      name: 'MT Test',
      prefix: 'b',
      arrivalDate: '',
      isActive: true
    })
    expect(v.prefix).toBe('B')
    expect(v.arrivalDate).toBeNull()
  })

  it('rejects multi-letter or non-Latin prefixes', () => {
    for (const prefix of ['AB', '1', 'ب', '']) {
      const r = vesselInputSchema.safeParse({
        name: 'x',
        prefix,
        arrivalDate: null,
        isActive: true
      })
      expect(r.success, prefix).toBe(false)
    }
  })
})
