import { useMemo } from 'react'
import { useWatch } from 'react-hook-form'
import { Pencil } from 'lucide-react'
import type { CustomsAgents, VesselSummary } from '@shared/api'
import { WIZARD_STEPS, type WizardStep } from '@shared/fields'
import { Button } from '@/components/ui/button'
import { toPrintData } from '@/components/print/print-data'
import { PrintPreview } from '@/components/print/PrintPreview'
import type { FormValues } from './form'
import { stepTitles } from './steps'

interface ReviewStepProps {
  vessels: VesselSummary[]
  agents: CustomsAgents
  onEdit: (step: WizardStep) => void
}

/** The document exactly as it will print, with a way back to each step. */
export function ReviewStep({ vessels, agents, onEdit }: ReviewStepProps): React.JSX.Element {
  const values = useWatch<FormValues>() as FormValues
  const vessel = vessels.find((v) => v.id === values.vesselId)
  const data = useMemo(
    () =>
      toPrintData({ ...values, serialNo: null, seals: values.seals.map((s) => s.value) }, agents),
    [values, agents]
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {/* The vessel isn't printed, so show it here to check before saving. */}
        <p className="text-sm">
          <span className="text-muted-foreground">الباخرة: </span>
          <span className="font-medium">{vessel ? `${vessel.name} — ${vessel.prefix}` : '—'}</span>
        </p>
        <nav aria-label="تعديل الخطوات" className="flex flex-wrap gap-1">
          {WIZARD_STEPS.map((step) => (
            <Button key={step} type="button" variant="link" size="sm" onClick={() => onEdit(step)}>
              <Pencil />
              تعديل {stepTitles[step]}
            </Button>
          ))}
        </nav>
      </div>
      <PrintPreview data={data} pendingSerial="يُحدد عند الحفظ" />
    </div>
  )
}
