/**
 * Form model for the new-document wizard. Values are validated by the shared
 * `documentInputSchema` (the same one main uses before saving); this file only adapts form
 * shapes to it and builds defaults from fields.ts.
 */
import { z } from 'zod'
import type { Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { CreateDocumentOptions, DocumentView } from '@shared/api'
import { documentInputFields, type DocumentInputField, type WizardStep } from '@shared/fields'
import { documentInputSchema, type DocumentInput } from '@shared/schemas'

/** Form value per field type. Seals are objects because useFieldArray needs them. */
type FormValueOf<F extends DocumentInputField> = F['type'] extends 'number' | 'ref'
  ? number | null
  : F['type'] extends 'stringList'
    ? { value: string }[]
    : string

export type DocumentFormValues = { [F in DocumentInputField as F['key']]: FormValueOf<F> }
export type FormValues = DocumentFormValues & Required<CreateDocumentOptions>

export type FieldKey = DocumentInputField['key']

export interface DefaultsContext {
  today: string
  settings: { activeVesselId: number | null }
}

export function buildDefaults({ today, settings }: DefaultsContext): FormValues {
  const values: Record<string, unknown> = {
    updateShipperAddress: false,
    updateConsigneeAddress: false,
    updateDriverPassport: false
  }
  for (const f of documentInputFields) {
    values[f.key] =
      f.type === 'number' || f.type === 'ref'
        ? null
        : f.type === 'stringList'
          ? [{ value: '' }]
          : ''
  }
  for (const f of documentInputFields) {
    if (!('default' in f)) continue
    const d = f.default
    if ('value' in d) values[f.key] = d.value
    else if ('today' in d) values[f.key] = today
    else if ('setting' in d) values[f.key] = settings[d.setting]
  }
  // Copies run last so they see the defaults they copy from.
  for (const f of documentInputFields) {
    if ('default' in f && 'copyOf' in f.default) values[f.key] = values[f.default.copyOf]
  }
  return values as FormValues
}

/**
 * "Duplicate as new" starts from the defaults of a new document (issue date today, transport date
 * following it, the active vessel) and copies every other field, the supply order date included:
 * several tankers usually share one supply order. Tanker, driver, passport and seals belong to
 * one trip and are left empty. The serial is assigned on save as always.
 */
export const DUPLICATE_CLEARED = [
  'issueDate',
  'transportDate',
  'tankerNo',
  'driverName',
  'passportNo',
  'seals'
] as const satisfies readonly FieldKey[]

export function duplicateValues(source: DocumentView, context: DefaultsContext): FormValues {
  const values: Record<string, unknown> = { ...buildDefaults(context) }
  const cleared: readonly string[] = DUPLICATE_CLEARED
  for (const f of documentInputFields) {
    if (f.type === 'ref' || cleared.includes(f.key)) continue
    const v = source[f.key]
    if (f.type === 'number') values[f.key] = v ?? null
    else if (f.type === 'stringList') {
      const items = (v as string[]).map((value) => ({ value }))
      values[f.key] = items.length ? items : [{ value: '' }]
    } else values[f.key] = v ?? ''
  }
  return values as FormValues
}

/** Fields whose default follows another field while the user hasn't edited them. */
export const copiedFields = documentInputFields.flatMap((f) =>
  'default' in f && 'copyOf' in f.default
    ? [{ key: f.key, from: f.default.copyOf as FieldKey }]
    : []
)

/** Form values → the shape the shared schema expects (seals as plain strings). */
function toSchemaInput(values: FormValues): unknown {
  return { ...values, seals: values.seals.map((s) => s.value) }
}

export const formSchema = z.preprocess(toSchemaInput, documentInputSchema)

export const formResolver: Resolver<FormValues, unknown, DocumentInput> = zodResolver(formSchema)

/** The wizard step a field lives on, used to jump to the first error. */
export function stepOfField(key: string): WizardStep | undefined {
  const root = key.split('.')[0]
  return documentInputFields.find((f) => f.key === root)?.step
}

type KeysOfType<T> = {
  [F in DocumentInputField as F['key']]: F['type'] extends T ? F['key'] : never
}[FieldKey]

export type StringKey = KeysOfType<'string'>
export type NumberKey = KeysOfType<'number'>
export type DateKey = KeysOfType<'date'>
export type FlagKey = keyof Required<CreateDocumentOptions>

/** DOM id of a document field's control. */
export function fieldId(key: string): string {
  return `doc-${key}`
}
