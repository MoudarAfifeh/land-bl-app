import { describe, expect, it } from 'vitest'
import {
  BLOCKED_PREFIXES,
  documentInputSchema,
  messages,
  partyInputSchema,
  prefixBlockedMessage,
  vesselInputSchema,
  vesselSchemaFor
} from './schemas'

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

describe('vesselSchemaFor', () => {
  const vessel = { name: 'MT Test', prefix: 'o', arrivalDate: null, isActive: true }

  it('refuses O and I for a new vessel, in any case', () => {
    expect(BLOCKED_PREFIXES).toEqual(['O', 'I'])
    for (const prefix of ['o', 'O', 'i', 'I']) {
      const result = vesselSchemaFor(null).safeParse({ ...vessel, prefix })
      expect(result.success, prefix).toBe(false)
      expect(result.error?.issues[0]).toMatchObject({
        path: ['prefix'],
        message: prefixBlockedMessage(prefix.toUpperCase())
      })
    }
    expect(vesselSchemaFor(null).parse({ ...vessel, prefix: 'q' }).prefix).toBe('Q')
  })

  it('lets a vessel keep a blocked letter it already has, but not change to one', () => {
    expect(vesselSchemaFor('O').parse(vessel).prefix).toBe('O')
    expect(vesselSchemaFor('A').safeParse({ ...vessel, prefix: 'I' }).success).toBe(false)
  })
})

describe('lookup inputs', () => {
  it('requires a name and turns a blank address into null', () => {
    expect(partyInputSchema.parse({ name: ' شركة ', address: '  ' })).toEqual({
      name: 'شركة',
      address: null
    })
    expect(partyInputSchema.safeParse({ name: '  ', address: null }).error?.issues[0].message).toBe(
      messages.required
    )
  })
})
