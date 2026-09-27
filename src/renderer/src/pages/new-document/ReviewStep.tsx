import { useWatch } from 'react-hook-form'
import { Pencil } from 'lucide-react'
import type { VesselSummary } from '@shared/api'
import {
  documentInputFields,
  WIZARD_STEPS,
  type DocumentInputField,
  type WizardStep
} from '@shared/fields'
import { Button } from '@/components/ui/button'
import { formatNumber, isoToDisplay } from '@/lib/format'
import type { FormValues } from './form'
import { stepTitles } from './steps'

function display(f: DocumentInputField, values: FormValues, vessels: VesselSummary[]): string {
  const v = values[f.key]
  if (f.key === 'vesselId') {
    const vessel = vessels.find((x) => x.id === v)
    return vessel ? `${vessel.name} — ${vessel.prefix}` : ''
  }
  switch (f.type) {
    case 'date':
      return isoToDisplay(v as string)
    case 'number':
      return formatNumber(v as number | null)
    case 'stringList':
      return (v as { value: string }[])
        .map((s) => s.value.trim())
        .filter(Boolean)
        .join('، ')
    default:
      return String(v ?? '').trim()
  }
}

interface ReviewStepProps {
  vessels: VesselSummary[]
  onEdit: (step: WizardStep) => void
}

/** Read-only summary grouped by step. The print layout comes in Phase 3. */
export function ReviewStep({ vessels, onEdit }: ReviewStepProps): React.JSX.Element {
  const values = useWatch<FormValues>() as FormValues

  return (
    <div className="flex flex-col gap-4">
      {WIZARD_STEPS.map((step) => (
        <section key={step} className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{stepTitles[step]}</h2>
            <Button type="button" variant="link" size="sm" onClick={() => onEdit(step)}>
              <Pencil />
              تعديل
            </Button>
          </div>
          <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
            {documentInputFields
              .filter((f) => f.step === step)
              .map((f) => {
                const text = display(f, values, vessels)
                return (
                  <div key={f.key} className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">{f.labelAr}:</dt>
                    <dd
                      // Numbers and dates read left to right, or "-40" shows as "40-".
                      dir={f.type === 'number' || f.type === 'date' ? 'ltr' : undefined}
                      className="break-words whitespace-pre-line"
                    >
                      {text || '—'}
                    </dd>
                  </div>
                )
              })}
          </dl>
        </section>
      ))}
    </div>
  )
}
