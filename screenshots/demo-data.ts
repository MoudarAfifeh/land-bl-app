/**
 * Fake demo data for the user-guide screenshots. Every name, number and address is invented:
 * no client, person or company from real documents.
 */
import type { CustomsAgents } from '../src/shared/api'
import type { DocumentInput, DriverInput, PartyInput, TankerInput } from '../src/shared/schemas'

export const demoOffice = 'مكتب التخليص التجريبي'

/** Replaces the default agent blocks, which name real people. */
export const demoAgents: CustomsAgents = {
  customsAgent1: 'المخلص السوري/ معبر التنف\nمكتب الأمل للتخليص الجمركي\n00963-11-000-0001',
  customsAgent2: 'المخلص العراقي / معبر الوليد\nمكتب الرافد للتخليص\n00964-770-000-0002'
}

export const demoVessels = {
  old: { name: 'MT Blue Horizon', prefix: 'H', arrivalDate: '2026-08-18', isActive: true },
  current: { name: 'MT Ocean Pearl', prefix: 'P', arrivalDate: '2026-09-10', isActive: true }
}

export const demoParties: PartyInput[] = [
  { name: 'شركة الأفق للتجارة العامة', address: 'العراق - البصرة - شارع الكورنيش' },
  { name: 'مؤسسة النخيل للنقل والتجارة', address: 'العراق - بغداد - المنصور' },
  { name: 'شركة الساحل للمحروقات', address: 'سوريا - دمشق - المنطقة الحرة' },
  { name: 'Northgate Fuel Trading LLC', address: 'Syria - Homs - Industrial City' }
]

export const demoDrivers: DriverInput[] = [
  { name: 'أحمد محمود الخطيب', passportNo: 'N1000231' },
  { name: 'خالد عبد الله العلي', passportNo: 'N1000452' },
  { name: 'سامر يوسف الحسن', passportNo: 'A2000873' },
  { name: 'علي حسين الكعبي', passportNo: 'A2001194' }
]

export const demoTankers: TankerInput[] = [
  { tankerNo: 'بغداد 45821' },
  { tankerNo: 'البصرة 71230' },
  { tankerNo: 'دمشق 509614' },
  { tankerNo: 'حمص 338207' }
]

type Trip = {
  date: string
  shipper: number
  consignee: number
  gasoline: boolean
  driver: number
  tanker: number
  liters: number
}

function trip(vesselId: number, t: Trip, n: number): DocumentInput {
  const standard = Math.round(t.liters * 0.9921)
  const density = t.gasoline ? 0.7452 : 0.8436
  const shipper = demoParties[t.shipper]
  const consignee = demoParties[t.consignee]
  const driver = demoDrivers[t.driver]
  return {
    vesselId,
    issueDate: t.date,
    shipperName: shipper.name,
    shipperAddress: shipper.address,
    consigneeName: consignee.name,
    consigneeAddress: consignee.address,
    product: t.gasoline ? 'بنزين/ Gasoline' : 'مازوت/ Gas oil',
    qtyNaturalL: t.liters,
    qtyStandardL: standard,
    weightKg: Math.round(standard * density),
    barrels: Math.round((standard / 158.987) * 100) / 100,
    seals: Array.from({ length: 4 }, (_, i) => `S-${7400 + n * 4 + i}`),
    density15: density,
    octane: t.gasoline ? 95 : null,
    flashPoint: t.gasoline ? -43 : 62,
    temperature: 27.5,
    vcf: 0.9921,
    meterFactor: 1.0002,
    crossingNo: `CR-2026-${String(4100 + n)}`,
    supplyOfficerName: 'سليم ناصر',
    supplyOfficerTitle: 'مسؤول التجهيز',
    missionNo: `MF-2026/${String(310 + n)}`,
    supplyOrderNo: `SO-2026/${String(88 + Math.floor(n / 3))}`,
    supplyOrderDate: '2026-08-15',
    tankerNo: demoTankers[t.tanker].tankerNo,
    driverName: driver.name,
    passportNo: driver.passportNo,
    carrierRep: 'شركة الطريق السريع للنقل',
    transportDate: t.date
  }
}

/** Three trips for the old vessel, five for the current one. */
export function demoDocuments(oldId: number, currentId: number): DocumentInput[] {
  const old: Trip[] = [
    {
      date: '2026-08-20',
      shipper: 0,
      consignee: 2,
      gasoline: true,
      driver: 0,
      tanker: 0,
      liters: 36000
    },
    {
      date: '2026-08-21',
      shipper: 0,
      consignee: 2,
      gasoline: true,
      driver: 1,
      tanker: 1,
      liters: 35500
    },
    {
      date: '2026-08-24',
      shipper: 1,
      consignee: 3,
      gasoline: false,
      driver: 2,
      tanker: 2,
      liters: 38000
    }
  ]
  const current: Trip[] = [
    {
      date: '2026-09-12',
      shipper: 0,
      consignee: 2,
      gasoline: true,
      driver: 3,
      tanker: 3,
      liters: 36000
    },
    {
      date: '2026-09-14',
      shipper: 1,
      consignee: 3,
      gasoline: false,
      driver: 0,
      tanker: 0,
      liters: 37200
    },
    {
      date: '2026-09-18',
      shipper: 0,
      consignee: 3,
      gasoline: true,
      driver: 1,
      tanker: 1,
      liters: 36000
    },
    {
      date: '2026-09-22',
      shipper: 1,
      consignee: 2,
      gasoline: false,
      driver: 2,
      tanker: 2,
      liters: 38000
    },
    {
      date: '2026-09-25',
      shipper: 0,
      consignee: 2,
      gasoline: true,
      driver: 3,
      tanker: 3,
      liters: 35800
    }
  ]
  return [
    ...old.map((t, i) => trip(oldId, t, i)),
    ...current.map((t, i) => trip(currentId, t, old.length + i))
  ]
}
