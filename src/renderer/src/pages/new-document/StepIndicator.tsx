import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { allSteps, stepTitles, type Step } from './steps'

interface StepIndicatorProps {
  current: Step
  /** Furthest step reached; later steps can't be clicked yet. */
  reached: Step
  onSelect: (step: Step) => void
}

export function StepIndicator({
  current,
  reached,
  onSelect
}: StepIndicatorProps): React.JSX.Element {
  return (
    <nav aria-label="خطوات الوثيقة">
      <ol className="flex items-center gap-2">
        {allSteps.map((s) => (
          <li key={s} className={cn('flex items-center gap-2', s < allSteps.length && 'flex-1')}>
            <button
              type="button"
              disabled={s > reached}
              aria-current={s === current ? 'step' : undefined}
              onClick={() => onSelect(s)}
              className="flex items-center gap-2 rounded-md p-1 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border font-medium',
                  s === current && 'border-primary bg-primary text-primary-foreground',
                  s < current && 'border-primary text-primary'
                )}
              >
                {s < current ? <Check className="size-4" /> : s}
              </span>
              <span className={cn('whitespace-nowrap', s === current && 'font-semibold')}>
                {stepTitles[s]}
              </span>
            </button>
            {s < allSteps.length && <span aria-hidden className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>
    </nav>
  )
}
