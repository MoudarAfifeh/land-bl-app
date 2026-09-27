import * as React from 'react'
import { Input } from '@/components/ui/input'
import { displayToIso, isoToDisplay } from '@/lib/format'
import { cn } from '@/lib/utils'

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Typed text → form value: ISO when it's a real date, '' when blank, else the raw text (invalid). */
function textToValue(text: string): string {
  if (text.trim() === '') return ''
  return displayToIso(text) ?? text
}

interface DateInputProps extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> {
  /** ISO date, '' or invalid raw text. */
  value: string
  onValueChange: (value: string) => void
}

/**
 * DD/MM/YYYY text input storing ISO. Not <input type="date">: its display follows the Windows
 * locale, and the app must show DD/MM/YYYY everywhere.
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { value, onValueChange, onBlur, className, ...props },
  ref
) {
  const [text, setText] = React.useState(() => isoToDisplay(value))
  const [seen, setSeen] = React.useState(value)

  // The value changed from outside (reset, copy from another date): show it.
  if (value !== seen) {
    setSeen(value)
    if (value !== textToValue(text)) setText(isoToDisplay(value))
  }

  return (
    <Input
      {...props}
      ref={ref}
      dir="ltr"
      inputMode="numeric"
      placeholder="DD/MM/YYYY"
      autoComplete="off"
      className={cn('text-right', className)}
      value={text}
      onChange={(e) => {
        const next = textToValue(e.target.value)
        setText(e.target.value)
        setSeen(next)
        onValueChange(next)
      }}
      onBlur={(e) => {
        const current = textToValue(text)
        if (ISO.test(current)) setText(isoToDisplay(current))
        onBlur?.(e)
      }}
    />
  )
})
