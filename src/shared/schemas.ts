/**
 * Zod schemas derived from fields.ts. The same schemas validate the form (renderer)
 * and the data before saving (main).
 */
import { z } from 'zod'
import {
  documentInputFields,
  settingFields,
  vesselFields,
  type FieldDef,
  type DocumentInputField
} from './fields'

export const messages = {
  required: 'هذا الحقل مطلوب',
  number: 'يجب إدخال رقم',
  date: 'تاريخ غير صالح',
  ref: 'يجب الاختيار من القائمة',
  tooMany: (max: number) => `الحد الأقصى ${max}`,
  prefix: 'حرف واحد من A إلى Z'
} as const

/** The TypeScript value of a field once validated. */
type ValueOf<F extends FieldDef> = F['type'] extends 'number'
  ? F['required'] extends true
    ? number
    : number | null
  : F['type'] extends 'ref'
    ? F['required'] extends true
      ? number
      : number | null
    : F['type'] extends 'stringList'
      ? string[]
      : F['type'] extends 'boolean'
        ? boolean
        : F['required'] extends true
          ? string
          : string | null

type ValuesOf<F extends FieldDef> = { [K in F as K['key']]: ValueOf<K> }
type ShapeOf<T> = { [K in keyof T]: z.ZodType<T[K], unknown> }

/** Blank form inputs ('' or whitespace) mean "no value". */
const blankToNull = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v)

const isoDate = z
  .string({ error: messages.date })
  .regex(/^\d{4}-\d{2}-\d{2}$/, messages.date)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
  }, messages.date)

function fieldSchema(f: FieldDef): z.ZodType {
  switch (f.type) {
    case 'string': {
      const s = z.string({ error: messages.required }).trim()
      return f.required ? s.min(1, messages.required) : z.preprocess(blankToNull, s.nullable())
    }
    case 'date':
      return f.required
        ? z.preprocess(blankToNull, z.string({ error: messages.required }).pipe(isoDate))
        : z.preprocess(blankToNull, isoDate.nullable())
    case 'number': {
      const n = z.number({ error: messages.number }).finite(messages.number)
      return z.preprocess(blankToNull, f.required ? n : n.nullable())
    }
    case 'ref': {
      const r = z.number({ error: messages.ref }).int(messages.ref).positive(messages.ref)
      return f.required ? r : r.nullable()
    }
    case 'stringList':
      // Blank inputs are dropped, so the 12 seal boxes can be partly filled.
      return z.preprocess(
        (v) =>
          Array.isArray(v)
            ? v.map((s) => (typeof s === 'string' ? s.trim() : s)).filter((s) => s !== '')
            : v,
        z.array(z.string()).max(f.max ?? Infinity, messages.tooMany(f.max ?? 0))
      )
    case 'boolean':
      return z.boolean()
  }
}

function shapeOf<F extends FieldDef>(fields: readonly F[]): ShapeOf<ValuesOf<F>> {
  return Object.fromEntries(fields.map((f) => [f.key, fieldSchema(f)])) as ShapeOf<ValuesOf<F>>
}

export type DocumentInput = ValuesOf<DocumentInputField>
export const documentInputSchema = z.object(shapeOf(documentInputFields))

export type Settings = ValuesOf<(typeof settingFields)[number]>
export const settingsSchema = z.object(shapeOf(settingFields))

export type VesselInput = ValuesOf<(typeof vesselFields)[number]>
export const vesselInputSchema = z.object({
  ...shapeOf(vesselFields),
  prefix: z
    .string({ error: messages.prefix })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]$/, messages.prefix)
})

export const HISTORY_PAGE_SIZE = 50

/** Filters of the documents history; validated in main before querying. */
export const documentListQuerySchema = z.object({
  search: z.string().max(200).default(''),
  vesselId: z.number().int().positive().nullable().default(null),
  /** Issue date range, inclusive, ISO. */
  from: isoDate.nullable().default(null),
  to: isoDate.nullable().default(null),
  includeDeleted: z.boolean().default(false),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(HISTORY_PAGE_SIZE)
})

export type DocumentListQuery = z.input<typeof documentListQuerySchema>
