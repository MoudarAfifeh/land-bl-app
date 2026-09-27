/** Form controls bound to the wizard form, labelled from fields.ts. */
import { Controller, useFormContext } from 'react-hook-form'
import { documentFieldByKey } from '@shared/fields'
import { Autocomplete, type AutocompleteOption } from '@/components/form/Autocomplete'
import { controlProps } from '@/components/form/control-props'
import { DateInput } from '@/components/form/DateInput'
import { Field } from '@/components/form/Field'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseNumber } from '@/lib/format'
import {
  fieldId,
  type DateKey,
  type FieldKey,
  type FlagKey,
  type FormValues,
  type NumberKey,
  type StringKey
} from './form'
import { useFieldError } from './hooks'

function labelsOf(key: FieldKey): { label: string; hint: string; required: boolean } {
  const f = documentFieldByKey(key)
  return { label: f.labelAr, hint: f.labelEn, required: f.required }
}

export function TextField({ name }: { name: StringKey }): React.JSX.Element {
  const { register } = useFormContext<FormValues>()
  const error = useFieldError(name)
  const id = fieldId(name)
  return (
    <Field id={id} {...labelsOf(name)} error={error}>
      <Input {...controlProps(id, error)} autoComplete="off" {...register(name)} />
    </Field>
  )
}

export function NumberField({ name }: { name: NumberKey }): React.JSX.Element {
  const { register } = useFormContext<FormValues>()
  const error = useFieldError(name)
  const id = fieldId(name)
  return (
    <Field id={id} {...labelsOf(name)} error={error}>
      <Input
        {...controlProps(id, error)}
        dir="ltr"
        inputMode="decimal"
        autoComplete="off"
        className="text-right"
        {...register(name, {
          setValueAs: (v: unknown) => (typeof v === 'string' ? parseNumber(v) : v)
        })}
      />
    </Field>
  )
}

export function DateField({ name }: { name: DateKey }): React.JSX.Element {
  const { control } = useFormContext<FormValues>()
  const id = fieldId(name)
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field id={id} {...labelsOf(name)} error={fieldState.error?.message}>
          <DateInput
            {...controlProps(id, fieldState.error?.message)}
            ref={field.ref}
            name={field.name}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
          />
        </Field>
      )}
    />
  )
}

/** The right control for a plain field, from its type in fields.ts. */
export function FieldFor({ name }: { name: StringKey | NumberKey | DateKey }): React.JSX.Element {
  switch (documentFieldByKey(name).type) {
    case 'number':
      return <NumberField name={name as NumberKey} />
    case 'date':
      return <DateField name={name as DateKey} />
    default:
      return <TextField name={name as StringKey} />
  }
}

interface LookupFieldProps {
  name: StringKey
  options: readonly AutocompleteOption[]
  /** A suggestion was picked; the name is already set. */
  onPick?: (option: AutocompleteOption) => void
  /** The user left the field (typed or picked). */
  onLeave?: () => void
}

/** Free-text field with suggestions from a lookup list. */
export function LookupField({
  name,
  options,
  onPick,
  onLeave
}: LookupFieldProps): React.JSX.Element {
  const { control, setValue } = useFormContext<FormValues>()
  const id = fieldId(name)
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field id={id} {...labelsOf(name)} error={fieldState.error?.message}>
          <Autocomplete
            {...controlProps(id, fieldState.error?.message)}
            ref={field.ref}
            name={field.name}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={() => {
              field.onBlur()
              onLeave?.()
            }}
            options={options}
            onPick={(option) => {
              setValue(name, option.label, { shouldDirty: true, shouldValidate: true })
              onPick?.(option)
            }}
          />
        </Field>
      )}
    />
  )
}

interface StoredValueCheckboxProps {
  name: FlagKey
  label: string
  stored: string
}

/** "Update the stored value" choice, shown when the document's value differs from the lookup. */
export function StoredValueCheckbox({
  name,
  label,
  stored
}: StoredValueCheckboxProps): React.JSX.Element {
  const { control } = useFormContext<FormValues>()
  const id = fieldId(name)
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Checkbox
            id={id}
            checked={field.value}
            onCheckedChange={(v) => field.onChange(v === true)}
            onBlur={field.onBlur}
          />
          <Label htmlFor={id} className="font-normal">
            {label}
          </Label>
          <span className="text-muted-foreground">(المحفوظ حالياً: {stored})</span>
        </div>
      )}
    />
  )
}
