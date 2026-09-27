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

const long = (text: string, times: number): string => Array(times).fill(text).join(' ')

/** The worst realistic case: all 12 seals and long names everywhere. */
export const longDocument: Omit<DocumentInput, 'vesselId'> = {
  issueDate: '2026-09-27',
  shipperName: long('شركة الخليج العربي للتجارة العامة والمقاولات والنقل البري المحدودة', 2),
  shipperAddress: long('العراق - البصرة - شارع الكورنيش - بناية رقم 14 - الطابق الثالث', 2),
  consigneeName: long('Al-Rafidain General Trading and Petroleum Products Company LLC', 2),
  consigneeAddress: long('Syria - Damascus - Free Zone - Building 7 - Office 12', 2),
  product: 'بنزين/ Gasoline - Premium Unleaded RON 95 خالي من الرصاص',
  qtyNaturalL: 36123.456,
  qtyStandardL: 35872.123,
  weightKg: 26789.5,
  barrels: 225.63,
  seals: Array.from({ length: 12 }, (_, i) => `SEAL-2026-${String(1000000 + i)}`),
  density15: 0.7456,
  octane: 95,
  flashPoint: -43,
  temperature: 28.5,
  vcf: 0.99312,
  meterFactor: 1.0002,
  crossingNo: 'CR-2026-000123456',
  supplyOfficerName: long('عبد الرحمن محمد عبد الله الحسيني', 2),
  supplyOfficerTitle: 'رئيس قسم التجهيز والتوزيع في المستودعات الرئيسية',
  missionNo: 'MF-2026/000123456/IRQ-SYR',
  supplyOrderNo: 'SO-2026/000987654/UCC',
  supplyOrderDate: '2026-09-20',
  tankerNo: 'بغداد 123456 أ / 654321',
  driverName: long('محمد عبد الكريم حسين علي الجبوري', 2),
  passportNo: 'A12345678 / N98765432',
  carrierRep: long('شركة النقل الدولي السريع', 2),
  transportDate: '2026-09-27'
}
