import { describe, expect, it } from 'vitest'
import type { DocumentView } from '@shared/api'
import { longDocument } from '../../../../main/services/test-fixtures'
import {
  buildDefaults,
  copiedFields,
  duplicateValues,
  DUPLICATE_CLEARED,
  formSchema,
  stepOfField
} from './form'

const defaults = buildDefaults({ today: '2026-09-27', settings: { activeVesselId: 3 } })

describe('wizard form', () => {
  it('builds defaults from fields.ts', () => {
    expect(defaults).toMatchObject({
      vesselId: 3,
      issueDate: '2026-09-27',
      product: 'بنزين/ Gasoline',
      transportDate: '2026-09-27',
      shipperName: '',
      qtyNaturalL: null,
      seals: [{ value: '' }],
      updateShipperAddress: false,
      updateDriverPassport: false
    })
    expect(
      buildDefaults({ today: '2026-09-27', settings: { activeVesselId: null } }).vesselId
    ).toBeNull()
  })

  it('knows transport date follows issue date', () => {
    expect(copiedFields).toEqual([{ key: 'transportDate', from: 'issueDate' }])
  })

  it('validates form values with the shared schema', () => {
    const result = formSchema.safeParse({
      ...defaults,
      shipperName: ' المرسل ',
      consigneeName: 'المستلم',
      tankerNo: 'T1',
      driverName: 'سائق',
      shipperAddress: '',
      seals: [{ value: ' 1001 ' }, { value: '' }, { value: '1002' }]
    })
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      shipperName: 'المرسل',
      shipperAddress: null,
      seals: ['1001', '1002']
    })
    expect(result.data).not.toHaveProperty('updateShipperAddress')
  })

  it('reports errors in Arabic on the field paths', () => {
    const result = formSchema.safeParse({
      ...defaults,
      vesselId: null,
      qtyNaturalL: NaN,
      issueDate: '31/02'
    })
    const issues = Object.fromEntries(
      result.error!.issues.map((i) => [i.path.join('.'), i.message])
    )
    expect(issues).toMatchObject({
      vesselId: 'يجب الاختيار من القائمة',
      issueDate: 'تاريخ غير صالح',
      shipperName: 'هذا الحقل مطلوب',
      qtyNaturalL: 'يجب إدخال رقم'
    })
  })

  it('maps field paths to their step', () => {
    expect(stepOfField('vesselId')).toBe(1)
    expect(stepOfField('seals.3.value')).toBe(2)
    expect(stepOfField('octane')).toBe(3)
    expect(stepOfField('driverName')).toBe(4)
  })
})

describe('duplicate as new', () => {
  const source: DocumentView = {
    ...longDocument,
    vesselId: 9,
    id: 41,
    serialNo: 'X00041',
    deletedAt: null,
    issueDate: '2026-01-10',
    transportDate: '2026-01-11',
    supplyOrderDate: '2026-01-05',
    shipperAddress: null
  }
  const ctx = { today: '2026-09-27', settings: { activeVesselId: 3 } }
  const values = duplicateValues(source, ctx)

  it('clears serial-related, trip-specific fields: tanker, driver, passport, seals', () => {
    expect(values).toMatchObject({
      tankerNo: '',
      driverName: '',
      passportNo: '',
      seals: [{ value: '' }]
    })
    expect(DUPLICATE_CLEARED).toEqual([
      'issueDate',
      'transportDate',
      'tankerNo',
      'driverName',
      'passportNo',
      'seals'
    ])
  })

  it('dates the copy today; transport date follows it again', () => {
    expect(values.issueDate).toBe('2026-09-27')
    expect(values.transportDate).toBe('2026-09-27')
  })

  it('uses the active vessel, not the original one', () => {
    expect(values.vesselId).toBe(3)
    expect(
      duplicateValues(source, { ...ctx, settings: { activeVesselId: null } }).vesselId
    ).toBeNull()
  })

  it('copies everything else, including the supply order date', () => {
    expect(values).toMatchObject({
      shipperName: longDocument.shipperName,
      shipperAddress: '',
      consigneeName: longDocument.consigneeName,
      consigneeAddress: longDocument.consigneeAddress,
      product: longDocument.product,
      qtyNaturalL: longDocument.qtyNaturalL,
      flashPoint: -43,
      supplyOfficerName: longDocument.supplyOfficerName,
      missionNo: longDocument.missionNo,
      supplyOrderNo: longDocument.supplyOrderNo,
      supplyOrderDate: '2026-01-05',
      carrierRep: longDocument.carrierRep,
      updateShipperAddress: false,
      updateDriverPassport: false
    })
  })

  it('gives a form that validates once tanker and driver are filled in', () => {
    const parsed = formSchema.safeParse({ ...values, tankerNo: '777', driverName: 'سائق جديد' })
    expect(parsed.success).toBe(true)
  })
})
