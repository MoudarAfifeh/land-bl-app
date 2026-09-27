import { describe, expect, it } from 'vitest'
import { buildDefaults, copiedFields, formSchema, stepOfField } from './form'

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
