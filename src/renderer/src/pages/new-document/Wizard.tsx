import { useEffect, useRef, useState } from 'react'
import { FormProvider, useForm, type FieldErrors } from 'react-hook-form'
import { Link } from 'react-router'
import { CheckCircle2, ChevronLeft, ChevronRight, Save } from 'lucide-react'
import type { DocumentView, VesselSummary } from '@shared/api'
import { errorMessageAr } from '@shared/errors'
import { stepFieldKeys, type WizardStep } from '@shared/fields'
import type { DocumentInput } from '@shared/schemas'
import { Button } from '@/components/ui/button'
import { todayIso } from '@/lib/format'
import { buildDefaults, duplicateValues, formResolver, stepOfField, type FormValues } from './form'
import { useFollowCopies, type WizardData } from './hooks'
import { LeaveGuard } from './LeaveGuard'
import { PrintActions } from '@/components/print/PrintActions'
import { ReviewStep } from './ReviewStep'
import { Step1Parties } from './Step1Parties'
import { Step2Loading } from './Step2Loading'
import { Step3Quality } from './Step3Quality'
import { Step4Transport } from './Step4Transport'
import { StepIndicator } from './StepIndicator'
import { allSteps, focusableFields, REVIEW_STEP, stepTitles, type Step } from './steps'

function defaultsFor(data: WizardData, source?: DocumentView): FormValues {
  const context = { today: todayIso(), settings: { activeVesselId: data.activeVessel?.id ?? null } }
  return source ? duplicateValues(source, context) : buildDefaults(context)
}

interface WizardProps {
  data: WizardData
  reload: () => Promise<WizardData>
  /** "Duplicate as new": the saved document to start from. */
  source?: DocumentView
  /** After saving, "وثيقة جديدة" starts a blank document (drops the duplicate's source). */
  onStartNew?: () => void
}

/** One form across all steps, so values survive moving back and forth. */
export function Wizard({ data, reload, source, onStartNew }: WizardProps): React.JSX.Element {
  const form = useForm<FormValues, unknown, DocumentInput>({
    resolver: formResolver,
    defaultValues: defaultsFor(data, source),
    mode: 'onTouched'
  })
  const resetCopies = useFollowCopies(form)
  const [step, setStep] = useState<Step>(1)
  const [reached, setReached] = useState<Step>(1)
  const [saved, setSaved] = useState<{ id: number; serialNo: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const savingRef = useRef(false)
  const stepRefs = useRef<Partial<Record<Step, HTMLElement | null>>>({})
  const successRef = useRef<HTMLDivElement>(null)

  // Keyboard users land on the first field of each step.
  useEffect(() => {
    // After saving, "new document" (Button forwards no ref under React 18, so query the panel).
    if (saved) successRef.current?.querySelector('button')?.focus()
    else focusableFields(stepRefs.current[step] ?? null)[0]?.focus()
  }, [step, saved])

  /** Moves to a step; going forward validates every step in between. */
  async function goTo(target: Step): Promise<void> {
    for (let s = step; s < target; s++) {
      if (s < REVIEW_STEP && !(await form.trigger(stepFieldKeys(s as WizardStep)))) {
        setStep(s)
        return
      }
    }
    setStep(target)
    setReached((r) => (target > r ? target : r))
  }

  function onStepKeyDown(e: React.KeyboardEvent<HTMLElement>): void {
    if (e.key !== 'Enter' || e.defaultPrevented || e.nativeEvent.isComposing) return
    const target = e.target
    // Portalled dialogs bubble through React; only handle this step's own inputs.
    if (!(target instanceof HTMLInputElement) || !e.currentTarget.contains(target)) return
    e.preventDefault()
    const fields = focusableFields(e.currentTarget)
    const next = fields[fields.indexOf(target) + 1]
    if (next) next.focus()
    else if (step < REVIEW_STEP) void goTo((step + 1) as Step)
  }

  function onVesselCreated(vessel: VesselSummary): void {
    void reload().then(() =>
      form.setValue('vesselId', vessel.id, { shouldDirty: true, shouldValidate: true })
    )
  }

  function jumpToFirstError(errors: FieldErrors<FormValues>): void {
    const steps = Object.keys(errors)
      .map(stepOfField)
      .filter((s): s is WizardStep => s !== undefined)
    if (steps.length > 0) setStep(Math.min(...steps) as Step)
  }

  const submit = form.handleSubmit(async (input) => {
    setSaveError(null)
    let created: { id: number; serialNo: string }
    try {
      const [updateShipperAddress, updateConsigneeAddress, updateDriverPassport] = form.getValues([
        'updateShipperAddress',
        'updateConsigneeAddress',
        'updateDriverPassport'
      ])
      created = await window.api.documents.create(input, {
        updateShipperAddress,
        updateConsigneeAddress,
        updateDriverPassport
      })
    } catch (e) {
      setSaveError(errorMessageAr(e))
      return
    }
    // Saved: clear the form so leaving isn't blocked, then refresh the lookups with new names.
    form.reset(defaultsFor(data))
    resetCopies()
    setSaved(created)
    reload().catch(() => undefined)
  }, jumpToFirstError)

  function save(): void {
    // A ref, not state: a double click must never issue two serials.
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    void submit().finally(() => {
      savingRef.current = false
      setSaving(false)
    })
  }

  function startNewDocument(): void {
    onStartNew?.()
    form.reset(defaultsFor(data))
    resetCopies()
    setSaveError(null)
    setSaved(null)
    setStep(1)
    setReached(1)
  }

  if (saved) {
    return (
      <div
        ref={successRef}
        className="flex flex-col items-center gap-4 rounded-lg border p-10 text-center"
      >
        <CheckCircle2 className="size-12 text-green-600" />
        <p className="text-lg font-medium">تم حفظ الوثيقة</p>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">رقم البوليصة</span>
          <span dir="ltr" className="font-mono text-5xl font-bold tracking-wider">
            {saved.serialNo}
          </span>
        </div>
        <div className="mt-2 flex gap-2">
          <Button onClick={startNewDocument}>وثيقة جديدة</Button>
          <Button asChild variant="outline">
            <Link to="/history">الذهاب إلى السجل</Link>
          </Button>
        </div>
        <PrintActions documentId={saved.id} />
      </div>
    )
  }

  return (
    <FormProvider {...form}>
      <LeaveGuard when={form.formState.isDirty} />
      <div className="flex flex-col gap-6">
        <StepIndicator current={step} reached={reached} onSelect={(s) => void goTo(s)} />

        {allSteps.map((s) => (
          <section
            key={s}
            ref={(el) => {
              stepRefs.current[s] = el
            }}
            hidden={s !== step}
            aria-label={stepTitles[s]}
            onKeyDown={onStepKeyDown}
          >
            {s === 1 && <Step1Parties data={data} onVesselCreated={onVesselCreated} />}
            {s === 2 && <Step2Loading />}
            {s === 3 && <Step3Quality />}
            {s === 4 && <Step4Transport data={data} />}
            {s === REVIEW_STEP && step === REVIEW_STEP && (
              <ReviewStep
                vessels={data.vessels}
                agents={data.agents}
                onEdit={(target) => setStep(target)}
              />
            )}
          </section>
        ))}

        {saveError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {saveError}
          </p>
        )}

        <div className="flex items-center justify-between border-t pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={step === 1}
            onClick={() => setStep((step - 1) as Step)}
          >
            <ChevronRight />
            السابق
          </Button>
          {step < REVIEW_STEP ? (
            <Button type="button" onClick={() => void goTo((step + 1) as Step)}>
              التالي
              <ChevronLeft />
            </Button>
          ) : (
            <Button type="button" onClick={save} disabled={saving}>
              <Save />
              {saving ? 'جارٍ الحفظ…' : 'حفظ الوثيقة'}
            </Button>
          )}
        </div>
      </div>
    </FormProvider>
  )
}
