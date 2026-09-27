import { useMemo } from 'react'
import { useFormContext } from 'react-hook-form'
import { findByName } from '@shared/lookups'
import type { AutocompleteOption } from '@/components/form/Autocomplete'
import { FieldFor, LookupField, StoredValueCheckbox } from './controls'
import type { FormValues } from './form'
import { useStoredConflict, type WizardData } from './hooks'

export function Step4Transport({ data }: { data: WizardData }): React.JSX.Element {
  const { getValues, setValue } = useFormContext<FormValues>()
  const tankerOptions = useMemo<AutocompleteOption[]>(
    () => data.tankers.map((t) => ({ id: t.id, label: t.tankerNo })),
    [data.tankers]
  )
  const driverOptions = useMemo<AutocompleteOption[]>(
    () => data.drivers.map((d) => ({ id: d.id, label: d.name, hint: d.passportNo })),
    [data.drivers]
  )
  const storedPassport = useStoredConflict(
    data.drivers,
    (d) => d.name,
    (d) => d.passportNo,
    'driverName',
    'passportNo'
  )

  return (
    <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
      <FieldFor name="missionNo" />
      <FieldFor name="supplyOrderNo" />
      <FieldFor name="supplyOrderDate" />
      <LookupField name="tankerNo" options={tankerOptions} />
      <LookupField
        name="driverName"
        options={driverOptions}
        onPick={(o) => setValue('passportNo', o.hint ?? '', { shouldDirty: true })}
        onLeave={() => {
          // A name typed in full (not picked) still brings its passport if none is entered yet.
          const driver = findByName(data.drivers, (d) => d.name, getValues('driverName'))
          if (driver?.passportNo && getValues('passportNo').trim() === '')
            setValue('passportNo', driver.passportNo, { shouldDirty: true })
        }}
      />
      <div className="flex flex-col gap-2">
        <FieldFor name="passportNo" />
        {storedPassport !== null && (
          <StoredValueCheckbox
            name="updateDriverPassport"
            label="تحديث رقم الجواز المحفوظ"
            stored={storedPassport}
          />
        )}
      </div>
      <FieldFor name="carrierRep" />
      <FieldFor name="transportDate" />
    </div>
  )
}
