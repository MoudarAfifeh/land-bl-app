import type { DocumentInput } from '@shared/schemas'

/** A minimal valid document for a vessel; override any field per test. */
export function sampleDocument(
  vesselId: number,
  overrides: Partial<DocumentInput> = {}
): DocumentInput {
  return {
    vesselId,
    issueDate: '2026-09-27',
    shipperName: 'شركة المرسل',
    shipperAddress: null,
    consigneeName: 'شركة المستلم',
    consigneeAddress: null,
    product: 'بنزين/ Gasoline',
    qtyNaturalL: 36000,
    qtyStandardL: null,
    weightKg: null,
    barrels: null,
    seals: ['1001', '1002'],
    density15: null,
    octane: null,
    flashPoint: null,
    temperature: null,
    vcf: null,
    meterFactor: null,
    crossingNo: null,
    supplyOfficerName: null,
    supplyOfficerTitle: null,
    missionNo: null,
    supplyOrderNo: null,
    supplyOrderDate: null,
    tankerNo: '123456',
    driverName: 'سائق',
    passportNo: null,
    carrierRep: null,
    transportDate: '2026-09-27',
    ...overrides
  }
}
