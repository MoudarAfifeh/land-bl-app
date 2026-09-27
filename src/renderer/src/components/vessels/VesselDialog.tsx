import { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import { Controller, useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { VesselListRow, VesselSummary } from '@shared/api'
import { errorMessageAr } from '@shared/errors'
import { vesselFields } from '@shared/fields'
import { vesselSchemaFor, type VesselInput } from '@shared/schemas'
import { controlProps } from '@/components/form/control-props'
import { DateInput } from '@/components/form/DateInput'
import { Field } from '@/components/form/Field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface VesselFormValues {
  name: string
  prefix: string
  arrivalDate: string
  isActive: boolean
}

const emptyVessel: VesselFormValues = { name: '', prefix: '', arrivalDate: '', isActive: true }

function labelOf(key: (typeof vesselFields)[number]['key']): {
  label: string
  hint: string
  required: boolean
} {
  const f = vesselFields.find((v) => v.key === key)!
  return { label: f.labelAr, hint: f.labelEn, required: f.required }
}

type VesselDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (vessel: VesselSummary) => void
} & (
  | {
      /** Add a vessel. "Set as current" is checked by default when there is none yet. */
      vessel?: undefined
      defaultMakeActive: boolean
    }
  | {
      /** Edit its name, letter (only while it has no documents) and arrival date. */
      vessel: VesselListRow
      defaultMakeActive?: undefined
    }
)

/** Adds a vessel (wizard and Settings) or edits one (Settings). */
export function VesselDialog({
  open,
  onOpenChange,
  onSaved,
  vessel,
  defaultMakeActive
}: VesselDialogProps): React.JSX.Element {
  const editing = vessel !== undefined
  const letterLocked = editing && vessel.documentCount > 0
  const initial: VesselFormValues = editing
    ? {
        name: vessel.name,
        prefix: vessel.prefix,
        arrivalDate: vessel.arrivalDate ?? '',
        isActive: vessel.isActive
      }
    : emptyVessel
  const resolver = useMemo(
    () =>
      zodResolver(vesselSchemaFor(vessel?.prefix ?? null)) as unknown as Resolver<
        VesselFormValues,
        unknown,
        VesselInput
      >,
    [vessel?.prefix]
  )
  const form = useForm<VesselFormValues, unknown, VesselInput>({
    resolver,
    defaultValues: initial
  })
  const [makeActive, setMakeActive] = useState(defaultMakeActive ?? false)
  const [error, setError] = useState<string | null>(null)
  const { errors, isSubmitting } = form.formState

  const submit = form.handleSubmit(async (input) => {
    setError(null)
    try {
      const saved = editing
        ? await window.api.vessels.update(vessel.id, input)
        : await window.api.vessels.create(input, { makeActive })
      onSaved(saved)
      onOpenChange(false)
    } catch (e) {
      setError(errorMessageAr(e))
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Start clean every time the dialog opens.
        onOpenAutoFocus={() => {
          form.reset(initial)
          setMakeActive(defaultMakeActive ?? false)
          setError(null)
        }}
      >
        <DialogHeader>
          <DialogTitle>{editing ? 'تعديل الباخرة' : 'إضافة باخرة'}</DialogTitle>
          <DialogDescription>
            حرف البوليصة يسبق رقم كل وثيقة لهذه الباخرة، ولا يمكن تغييره بعد إصدار أول وثيقة.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            // The dialog is portalled but may still sit inside another form's React tree.
            e.stopPropagation()
            void submit(e)
          }}
        >
          <Field id="vessel-name" {...labelOf('name')} error={errors.name?.message}>
            <Input
              {...controlProps('vessel-name', errors.name?.message)}
              autoComplete="off"
              {...form.register('name')}
            />
          </Field>
          <Field
            id="vessel-prefix"
            {...labelOf('prefix')}
            error={errors.prefix?.message}
            footer={
              letterLocked && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Lock className="size-3.5" />
                  مقفل: صدرت {vessel.documentCount} وثيقة لهذه الباخرة.
                </p>
              )
            }
          >
            <Input
              {...controlProps('vessel-prefix', errors.prefix?.message)}
              dir="ltr"
              maxLength={1}
              autoComplete="off"
              // Read-only, not disabled: a disabled field would be left out of the saved values.
              readOnly={letterLocked}
              className="w-16 text-center uppercase read-only:bg-muted"
              {...form.register('prefix')}
            />
          </Field>
          <Controller
            control={form.control}
            name="arrivalDate"
            render={({ field, fieldState }) => (
              <Field
                id="vessel-arrival"
                {...labelOf('arrivalDate')}
                error={fieldState.error?.message}
              >
                <DateInput
                  {...controlProps('vessel-arrival', fieldState.error?.message)}
                  ref={field.ref}
                  name={field.name}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                />
              </Field>
            )}
          />
          {!editing && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="vessel-make-active"
                checked={makeActive}
                onCheckedChange={(v) => setMakeActive(v === true)}
              />
              <Label htmlFor="vessel-make-active" className="font-normal">
                تعيينها الباخرة الحالية للوثائق الجديدة
              </Label>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              حفظ الباخرة
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
