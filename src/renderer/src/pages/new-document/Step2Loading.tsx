import { useFieldArray, useFormContext } from 'react-hook-form'
import { Plus, X } from 'lucide-react'
import { documentFieldByKey, MAX_SEALS } from '@shared/fields'
import { Field } from '@/components/form/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldFor } from './controls'
import { fieldId, type FormValues } from './form'
import { useFieldError } from './hooks'

function Seals(): React.JSX.Element {
  const { control, register } = useFormContext<FormValues>()
  const { fields, append, remove } = useFieldArray({ control, name: 'seals' })
  const error = useFieldError('seals')
  const def = documentFieldByKey('seals')

  return (
    <Field
      id={fieldId('seals.0.value')}
      label={`${def.labelAr} (${fields.length} / ${MAX_SEALS})`}
      hint={def.labelEn}
      error={error}
      className="md:col-span-2"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {fields.map((f, i) => (
          <div key={f.id} className="flex gap-1">
            <Input
              id={fieldId(`seals.${i}.value`)}
              aria-label={`${def.labelAr} ${i + 1}`}
              dir="ltr"
              autoComplete="off"
              className="text-right"
              {...register(`seals.${i}.value`)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`حذف الختم ${i + 1}`}
              disabled={fields.length === 1}
              onClick={() => remove(i)}
            >
              <X />
            </Button>
          </div>
        ))}
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={fields.length >= MAX_SEALS}
          onClick={() => append({ value: '' })}
        >
          <Plus />
          إضافة ختم
        </Button>
      </div>
    </Field>
  )
}

export function Step2Loading(): React.JSX.Element {
  return (
    <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
      <div className="md:col-span-2 md:w-1/2 md:pe-3">
        <FieldFor name="product" />
      </div>
      <FieldFor name="qtyNaturalL" />
      <FieldFor name="qtyStandardL" />
      <FieldFor name="weightKg" />
      <FieldFor name="barrels" />
      <Seals />
    </div>
  )
}
