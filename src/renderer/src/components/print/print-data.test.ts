import { describe, expect, it } from 'vitest'
import { toPrintData, type PrintSource } from './print-data'

const source: PrintSource = {
  serialNo: 'A00001',
  issueDate: '2026-09-27',
  shipperName: '  شركة المرسل ',
  shipperAddress: null,
  consigneeName: 'شركة المستلم',
  consigneeAddress: undefined,
  product: 'بنزين/ Gasoline',
  qtyNaturalL: 36000,
  qtyStandardL: 35872.5,
  weightKg: null,
  barrels: Number.NaN,
  seals: ['1001', ' ', '1002 '],
  density15: 0.745,
  octane: null,
  flashPoint: -40,
  temperature: null,
  vcf: null,
  meterFactor: null,
  crossingNo: null,
  supplyOfficerName: null,
  supplyOfficerTitle: null,
  missionNo: null,
  supplyOrderNo: null,
  supplyOrderDate: '2026-09-01',
  tankerNo: '123456',
  driverName: 'سائق',
  passportNo: null,
  carrierRep: null,
  transportDate: ''
}

describe('toPrintData', () => {
  const data = toPrintData(source, { customsAgent1: 'سوري\nسطر 2 ', customsAgent2: null })

  it('formats dates as DD/MM/YYYY and numbers without separators', () => {
    expect(data.values.issueDate).toBe('27/09/2026')
    expect(data.values.supplyOrderDate).toBe('01/09/2026')
    expect(data.values.qtyNaturalL).toBe('36000')
    expect(data.values.qtyStandardL).toBe('35872.5')
    expect(data.values.flashPoint).toBe('-40')
  })

  it('prints missing values as blanks and trims text', () => {
    expect(data.values.shipperName).toBe('شركة المرسل')
    expect(data.values.shipperAddress).toBe('')
    expect(data.values.consigneeAddress).toBe('')
    expect(data.values.weightKg).toBe('')
    expect(data.values.barrels).toBe('')
    expect(data.values.transportDate).toBe('')
  })

  it('always has 12 seal slots, filled in order without blanks', () => {
    expect(data.seals).toEqual(['1001', '1002', '', '', '', '', '', '', '', '', '', ''])
  })

  it('keeps the agent blocks multi-line', () => {
    expect(data.agents).toEqual({ customsAgent1: 'سوري\nسطر 2', customsAgent2: '' })
  })

  it('never includes the vessel', () => {
    expect(Object.keys(data.values)).not.toContain('vesselId')
  })
})
