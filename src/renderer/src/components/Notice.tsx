import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const tones = {
  info: 'border-border bg-muted/50',
  warning: 'border-amber-300 bg-amber-50 text-amber-950',
  danger: 'border-destructive/40 bg-destructive/10 text-destructive'
} as const

/** A boxed message: a hint, a warning, or something that needs action now. */
export function Notice({
  tone,
  className,
  children,
  ...props
}: {
  tone: keyof typeof tones
  className?: string
  children: ReactNode
} & React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      role={tone === 'info' ? undefined : tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-lg border p-3 text-sm', tones[tone], className)}
      {...props}
    >
      {children}
    </div>
  )
}
