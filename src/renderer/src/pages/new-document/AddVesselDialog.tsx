import { useState } from 'react'
import { Controller, useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { VesselSummary } from '@shared/api'
import { errorMessageAr } from '@shared/errors'
import { vesselFields } from '@shared/fields'
import { vesselInputSchema, type VesselInput } from '@shared/schemas'
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

const resolver = zodResolver(vesselInputSchema) as unknown as Resolver<
  VesselFormValues,
  unknown,
  VesselInput
>

function labelOf(key: (typeof vesselFields)[number]['key']): {
  label: string
  hint: string
  required: boolean
} {
  const f = vesselFields.find((v) => v.key === key)!
  return { label: f.labelAr, hint: f.labelEn, required: f.required }
}

interface AddVesselDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Checked by default when there is no active vessel yet. */
  defaultMakeActive: boolean
  onCreated: (vessel: VesselSummary) => void
}

/** Quick vessel creation from the wizard. Full vessel management is in Settings (Phase 6). */
export function AddVesselDialog({
  open,
  onOpenChange,
  defaultMakeActive,
  onCreated
}: AddVesselDialogProps): React.JSX.Element {
  const form = useForm<VesselFormValues, unknown, VesselInput>({
    resolver,
    defaultValues: emptyVessel
  })
  const [makeActive, setMakeActive] = useState(defaultMakeActive)
  const [error, setError] = useState<string | null>(null)
  const { errors, isSubmitting } = form.formState

  const submit = form.handleSubmit(async (input) => {
    setError(null)
    try {
      const vessel = await window.api.vessels.create(input, { makeActive })
      onCreated(vessel)
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
          form.reset(emptyVessel)
          setMakeActive(defaultMakeActive)
          setError(null)
        }}
      >
        <DialogHeader>
          <DialogTitle>إضافة باخرة</DialogTitle>
          <DialogDescription>
            حرف البوليصة يسبق رقم كل وثيقة لهذه الباخرة، ولا يمكن تغييره بعد إصدار أول وثيقة.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            // The dialog is portalled but still inside the wizard's React tree.
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
          <Field id="vessel-prefix" {...labelOf('prefix')} error={errors.prefix?.message}>
            <Input
              {...controlProps('vessel-prefix', errors.prefix?.message)}
              dir="ltr"
              maxLength={1}
              autoComplete="off"
              className="w-16 text-center uppercase"
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
