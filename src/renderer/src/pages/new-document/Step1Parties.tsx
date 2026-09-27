import { useMemo, useState } from 'react'
import { Controller, useFormContext } from 'react-hook-form'
import { Plus } from 'lucide-react'
import type { VesselSummary } from '@shared/api'
import { documentFieldByKey } from '@shared/fields'
import { findByName, type Party } from '@shared/lookups'
import type { AutocompleteOption } from '@/components/form/Autocomplete'
import { controlProps } from '@/components/form/control-props'
import { Field } from '@/components/form/Field'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { AddVesselDialog } from './AddVesselDialog'
import { DateField, LookupField, StoredValueCheckbox, TextField } from './controls'
import { fieldId, type FormValues } from './form'
import { useStoredConflict, type WizardData } from './hooks'

const partyKeys = {
  shipper: { name: 'shipperName', address: 'shipperAddress', update: 'updateShipperAddress' },
  consignee: {
    name: 'consigneeName',
    address: 'consigneeAddress',
    update: 'updateConsigneeAddress'
  }
} as const

function PartyFields({
  role,
  parties
}: {
  role: keyof typeof partyKeys
  parties: Party[]
}): React.JSX.Element {
  const keys = partyKeys[role]
  const { getValues, setValue } = useFormContext<FormValues>()
  const options = useMemo<AutocompleteOption[]>(
    () => parties.map((p) => ({ id: p.id, label: p.name, hint: p.address })),
    [parties]
  )
  const storedAddress = useStoredConflict(
    parties,
    (p) => p.name,
    (p) => p.address,
    keys.name,
    keys.address
  )

  return (
    <>
      <LookupField
        name={keys.name}
        options={options}
        onPick={(o) => setValue(keys.address, o.hint ?? '', { shouldDirty: true })}
        onLeave={() => {
          // A name typed in full (not picked) still brings its address if none is entered yet.
          const party = findByName(parties, (p) => p.name, getValues(keys.name))
          if (party?.address && getValues(keys.address).trim() === '')
            setValue(keys.address, party.address, { shouldDirty: true })
        }}
      />
      <div className="flex flex-col gap-2">
        <TextField name={keys.address} />
        {storedAddress !== null && (
          <StoredValueCheckbox
            name={keys.update}
            label="تحديث العنوان المحفوظ"
            stored={storedAddress}
          />
        )}
      </div>
    </>
  )
}

interface Step1Props {
  data: WizardData
  onVesselCreated: (vessel: VesselSummary) => void
}

export function Step1Parties({ data, onVesselCreated }: Step1Props): React.JSX.Element {
  const { control } = useFormContext<FormValues>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const vesselField = documentFieldByKey('vesselId')
  const id = fieldId('vesselId')

  return (
    <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
      <Controller
        control={control}
        name="vesselId"
        render={({ field, fieldState }) => (
          <Field
            id={id}
            label={vesselField.labelAr}
            hint={vesselField.labelEn}
            required
            error={fieldState.error?.message}
            footer={
              data.vessels.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  لا توجد باخرة نشطة. أضف باخرة للمتابعة.
                </p>
              )
            }
          >
            <div className="flex gap-2">
              <Select
                value={field.value === null ? '' : String(field.value)}
                onValueChange={(v) => field.onChange(Number(v))}
                disabled={data.vessels.length === 0}
              >
                <SelectTrigger
                  {...controlProps(id, fieldState.error?.message)}
                  className="flex-1"
                  onBlur={field.onBlur}
                >
                  <SelectValue placeholder="اختر الباخرة" />
                </SelectTrigger>
                <SelectContent>
                  {data.vessels.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.name} — {v.prefix}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(true)}>
                <Plus />
                إضافة باخرة
              </Button>
            </div>
          </Field>
        )}
      />
      <DateField name="issueDate" />
      <PartyFields role="shipper" parties={data.parties} />
      <PartyFields role="consignee" parties={data.parties} />

      <AddVesselDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultMakeActive={data.activeVessel === null}
        onCreated={onVesselCreated}
      />
    </div>
  )
}
