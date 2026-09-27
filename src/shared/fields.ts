/**
 * Single source of truth for every field (see docs/field-map.md).
 *
 * One key per field, used as the form field name, the DB column (snake_case of the key),
 * the Word placeholder `{key}` and, through `excel`, the Excel cell.
 * No Excel cell address may appear anywhere else in the codebase.
 */

export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'stringList' | 'ref'
export type WizardStep = 1 | 2 | 3 | 4

/** Where a value comes from when it isn't simply typed in. */
export type FieldSource =
  | 'auto'
  | 'lookup:parties'
  | 'lookup:drivers'
  | 'lookup:tankers'
  | 'lookup:vessels'
  | 'fromShipper'
  | 'fromConsignee'
  | 'fromDriver'

/** A literal value, today's date, a copy of another field, or a setting. */
export type FieldDefault =
  { value: string } | { today: true } | { copyOf: string } | { setting: string }

export interface FieldDef {
  key: string
  labelAr: string
  labelEn: string
  type: FieldType
  required: boolean
  /** Top-left cell of the (possibly merged) range; a list for `stringList`; null = not exported. */
  excel: string | readonly string[] | null
  /** Printed on the document / filled into the templates. */
  print: boolean
  step?: WizardStep
  default?: FieldDefault
  source?: FieldSource
  /** Maximum number of items for `stringList`. */
  max?: number
}

export const documentFields = [
  // Step 1 — Document & parties
  {
    key: 'serialNo',
    labelAr: 'رقم البوليصة',
    labelEn: 'Serial No',
    type: 'string',
    required: false,
    excel: 'C3',
    print: true,
    step: 1,
    source: 'auto'
  },
  {
    key: 'vesselId',
    labelAr: 'الباخرة',
    labelEn: 'Vessel',
    type: 'ref',
    required: true,
    excel: null,
    print: false,
    step: 1,
    default: { setting: 'activeVesselId' },
    source: 'lookup:vessels'
  },
  {
    key: 'issueDate',
    labelAr: 'تاريخ الإصدار',
    labelEn: 'Date of Issue',
    type: 'date',
    required: true,
    excel: 'C4',
    print: true,
    step: 1,
    default: { today: true }
  },
  {
    key: 'shipperName',
    labelAr: 'الجهة المرسلة',
    labelEn: 'Shipper',
    type: 'string',
    required: true,
    excel: 'C5',
    print: true,
    step: 1,
    source: 'lookup:parties'
  },
  {
    key: 'shipperAddress',
    labelAr: 'العنوان',
    labelEn: 'Address',
    type: 'string',
    required: false,
    excel: 'C6',
    print: true,
    step: 1,
    source: 'fromShipper'
  },
  {
    key: 'consigneeName',
    labelAr: 'المرسل إليها',
    labelEn: 'Consignee',
    type: 'string',
    required: true,
    excel: 'C7',
    print: true,
    step: 1,
    source: 'lookup:parties'
  },
  {
    key: 'consigneeAddress',
    labelAr: 'العنوان',
    labelEn: 'Address',
    type: 'string',
    required: false,
    excel: 'C8',
    print: true,
    step: 1,
    source: 'fromConsignee'
  },

  // Step 2 — Loading
  {
    key: 'product',
    labelAr: 'نوع المنتج',
    labelEn: 'Product',
    type: 'string',
    required: false,
    excel: 'G11',
    print: true,
    step: 2,
    default: { value: 'بنزين/ Gasoline' }
  },
  {
    key: 'qtyNaturalL',
    labelAr: 'طبيعي (ليتر)',
    labelEn: 'Natural (Liter)',
    type: 'number',
    required: false,
    excel: 'A11',
    print: true,
    step: 2
  },
  {
    key: 'qtyStandardL',
    labelAr: 'قياسي (ليتر)',
    labelEn: 'Standard (Liter)',
    type: 'number',
    required: false,
    excel: 'A12',
    print: true,
    step: 2
  },
  {
    key: 'weightKg',
    labelAr: 'الوزن (كغ)',
    labelEn: 'Weight (KG)',
    type: 'number',
    required: false,
    excel: 'A13',
    print: true,
    step: 2
  },
  {
    key: 'barrels',
    labelAr: 'برميل',
    labelEn: 'Barrel',
    type: 'number',
    required: false,
    excel: 'A14',
    print: true,
    step: 2
  },
  {
    // Stored as a JSON array; expanded to seal1..seal12 only when exporting.
    key: 'seals',
    labelAr: 'الأختام',
    labelEn: 'Seals Numbers',
    type: 'stringList',
    required: false,
    excel: ['A15', 'C15', 'E15', 'A16', 'C16', 'E16', 'A17', 'C17', 'E17', 'A18', 'C18', 'E18'],
    print: true,
    step: 2,
    max: 12
  },

  // Step 3 — Quality & supply officer
  {
    key: 'density15',
    labelAr: 'الكثافة القياسية 15@',
    labelEn: 'Density @15',
    type: 'number',
    required: false,
    excel: 'F20',
    print: true,
    step: 3
  },
  {
    key: 'octane',
    labelAr: 'الأوكتان',
    labelEn: 'Octane',
    type: 'number',
    required: false,
    excel: 'D20',
    print: true,
    step: 3
  },
  {
    key: 'flashPoint',
    labelAr: 'الوميض',
    labelEn: 'Flash point',
    type: 'number',
    required: false,
    excel: 'F22',
    print: true,
    step: 3
  },
  {
    key: 'temperature',
    labelAr: 'درجة الحرارة',
    labelEn: 'Temp',
    type: 'number',
    required: false,
    excel: 'D22',
    print: true,
    step: 3
  },
  {
    key: 'vcf',
    labelAr: 'معامل تصحيح الحجم',
    labelEn: 'Volume correction factor',
    type: 'number',
    required: false,
    excel: 'F23',
    print: true,
    step: 3
  },
  {
    key: 'meterFactor',
    labelAr: 'معامل العداد',
    labelEn: 'Meter factor',
    type: 'number',
    required: false,
    excel: 'D23',
    print: true,
    step: 3
  },
  {
    key: 'crossingNo',
    labelAr: 'رقم المنفذ',
    labelEn: 'Crossing No',
    type: 'string',
    required: false,
    excel: 'D24',
    print: true,
    step: 3
  },
  {
    key: 'supplyOfficerName',
    labelAr: 'موظف التجهيز',
    labelEn: 'Supply officer',
    type: 'string',
    required: false,
    excel: 'A20',
    print: true,
    step: 3
  },
  {
    key: 'supplyOfficerTitle',
    labelAr: 'المسمى الوظيفي',
    labelEn: 'Job Title',
    type: 'string',
    required: false,
    excel: 'A22',
    print: true,
    step: 3
  },

  // Step 4 — Transportation
  {
    key: 'missionNo',
    labelAr: 'رقم تسهيل المهمة',
    labelEn: 'Mission facilitation No',
    type: 'string',
    required: false,
    excel: 'D27',
    print: true,
    step: 4
  },
  {
    key: 'supplyOrderNo',
    labelAr: 'رقم الأمر التجهيزي',
    labelEn: 'Supply order No',
    type: 'string',
    required: false,
    excel: 'D28',
    print: true,
    step: 4
  },
  {
    key: 'supplyOrderDate',
    labelAr: 'تاريخ الأمر التجهيزي',
    labelEn: 'Supply order date',
    type: 'date',
    required: false,
    excel: 'D29',
    print: true,
    step: 4
  },
  {
    key: 'tankerNo',
    labelAr: 'رقم الصهريج',
    labelEn: 'Tanker No',
    type: 'string',
    required: true,
    excel: 'D30',
    print: true,
    step: 4,
    source: 'lookup:tankers'
  },
  {
    key: 'driverName',
    labelAr: 'اسم السائق',
    labelEn: 'Driver Name',
    type: 'string',
    required: true,
    excel: 'D31',
    print: true,
    step: 4,
    source: 'lookup:drivers'
  },
  {
    key: 'passportNo',
    labelAr: 'رقم جواز السفر',
    labelEn: 'Passport No',
    type: 'string',
    required: false,
    excel: 'D32',
    print: true,
    step: 4,
    source: 'fromDriver'
  },
  {
    key: 'carrierRep',
    labelAr: 'ممثل الناقل',
    labelEn: 'Carrier rep',
    type: 'string',
    required: false,
    excel: 'E33',
    print: true,
    step: 4
  },
  {
    key: 'transportDate',
    labelAr: 'التاريخ',
    labelEn: 'Date',
    type: 'date',
    required: false,
    excel: 'E34',
    print: true,
    step: 4,
    default: { copyOf: 'issueDate' }
  }
] as const satisfies readonly FieldDef[]

/** App-wide settings (not per document). */
export const settingFields = [
  {
    key: 'activeVesselId',
    labelAr: 'الباخرة الحالية',
    labelEn: 'Active vessel',
    type: 'ref',
    required: false,
    excel: null,
    print: false
  },
  {
    key: 'customsAgent1',
    labelAr: 'المخلّص السوري',
    labelEn: 'Syrian customs agent',
    type: 'string',
    required: false,
    excel: 'A27',
    print: true,
    default: { value: 'المخلص السوري/ معبر التنف\nشركة الحسن/ عمر سفيان\n00963-933-351758' }
  },
  {
    key: 'customsAgent2',
    labelAr: 'المخلّص العراقي',
    labelEn: 'Iraqi customs agent',
    type: 'string',
    required: false,
    excel: 'A30',
    print: true,
    default: { value: 'المخلص العراقي / معبر الوليد\nبشار أبو حسن\n00964-772-3247959' }
  }
] as const satisfies readonly FieldDef[]

/** A vessel (الباخرة). Its letter prefixes the serial of every document issued for it. */
export const vesselFields = [
  {
    key: 'name',
    labelAr: 'اسم الباخرة',
    labelEn: 'Vessel name',
    type: 'string',
    required: true,
    excel: null,
    print: false
  },
  {
    key: 'prefix',
    labelAr: 'حرف البوليصة',
    labelEn: 'Serial letter',
    type: 'string',
    required: true,
    excel: null,
    print: false
  },
  {
    key: 'arrivalDate',
    labelAr: 'تاريخ الوصول',
    labelEn: 'Arrival date',
    type: 'date',
    required: false,
    excel: null,
    print: false
  },
  {
    key: 'isActive',
    labelAr: 'نشطة',
    labelEn: 'Active',
    type: 'boolean',
    required: false,
    excel: null,
    print: false
  }
] as const satisfies readonly FieldDef[]

export type DocumentField = (typeof documentFields)[number]
export type DocumentFieldKey = DocumentField['key']
export type SettingField = (typeof settingFields)[number]
export type SettingKey = SettingField['key']

/** Fields the user fills in (everything except values assigned by the app). */
export type DocumentInputField = Exclude<DocumentField, { source: 'auto' }>

export const documentInputFields = documentFields.filter(
  (f): f is DocumentInputField => !('source' in f && f.source === 'auto')
)

export const SERIAL_DIGITS = 5
export const MAX_SEALS = 12

export const WIZARD_STEPS = [1, 2, 3, 4] as const satisfies readonly WizardStep[]

/** Word placeholders of the seals, in template order: seal1 … seal12. */
export const SEAL_KEYS = Array.from({ length: MAX_SEALS }, (_, i) => `seal${i + 1}`)

/**
 * One value in the Excel and Word templates: a printed field, one seal, or a customs agent block.
 * `key` is also the Word placeholder `{key}`; `cell` is the top-left cell of its merge.
 */
export interface ExportSlot {
  key: string
  cell: string
  type: 'string' | 'number' | 'date'
}

/** Every value slot of the templates, in field order. */
export function exportSlots(): ExportSlot[] {
  const slots: ExportSlot[] = []
  for (const f of [...documentFields, ...settingFields] as readonly FieldDef[]) {
    if (!f.print || f.excel === null) continue
    if (typeof f.excel === 'string') {
      slots.push({
        key: f.key,
        cell: f.excel,
        type: f.type === 'number' || f.type === 'date' ? f.type : 'string'
      })
    } else {
      f.excel.forEach((cell, i) => slots.push({ key: SEAL_KEYS[i], cell, type: 'string' }))
    }
  }
  return slots
}

/** Keys the user fills in on a wizard step, in form order. */
export function stepFieldKeys(step: WizardStep): DocumentInputField['key'][] {
  return documentInputFields.filter((f) => f.step === step).map((f) => f.key)
}

export function documentFieldByKey<K extends DocumentFieldKey>(
  key: K
): Extract<DocumentField, { key: K }> {
  return documentFields.find((f) => f.key === key) as Extract<DocumentField, { key: K }>
}
