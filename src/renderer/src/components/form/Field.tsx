import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { errorId } from './control-props'

interface FieldProps {
  id: string
  label: string
  /** English label, shown small after the Arabic one. */
  hint?: string
  required?: boolean
  error?: string
  className?: string
  children: ReactNode
  /** Extra content under the control, e.g. an "update stored value" checkbox. */
  footer?: ReactNode
}

/** Label, control and its Arabic error message, stacked. */
export function Field({
  id,
  label,
  hint,
  required,
  error,
  className,
  children,
  footer
}: FieldProps): React.JSX.Element {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} className="gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
        {hint && (
          <span dir="ltr" className="ms-1 text-xs font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </Label>
      {children}
      {error && (
        <p id={errorId(id)} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {footer}
    </div>
  )
}
