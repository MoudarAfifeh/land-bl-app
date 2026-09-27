import * as React from 'react'
import { CalendarDays } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  calendarFormatters,
  calendarLabels,
  calendarLocale,
  dateToIso,
  isoToDate,
  WEEK_STARTS_ON
} from '@/lib/calendar-format'
import { displayToIso, isoToDisplay } from '@/lib/format'
import { cn } from '@/lib/utils'

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Years offered in the calendar's year list; typing accepts any date. */
const FIRST_YEAR = 2000
const YEARS_AHEAD = 5

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
 * DD/MM/YYYY text input storing ISO, with a calendar to pick the date. Not <input type="date">:
 * its display follows the Windows locale, and the app must show DD/MM/YYYY everywhere.
 *
 * The calendar button stays out of the tab order so Tab still goes field to field;
 * Alt+↓ in the field opens the calendar from the keyboard.
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { value, onValueChange, onBlur, onKeyDown, className, disabled, ...props },
  ref
) {
  const [text, setText] = React.useState(() => isoToDisplay(value))
  const [seen, setSeen] = React.useState(value)
  const [open, setOpen] = React.useState(false)
  const [month, setMonth] = React.useState<Date>(() => new Date())
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  // The value changed from outside (reset, copy from another date): show it.
  if (value !== seen) {
    setSeen(value)
    if (value !== textToValue(text)) setText(isoToDisplay(value))
  }

  const selected = isoToDate(value) ?? undefined
  const now = new Date()
  const firstYear = Math.min(FIRST_YEAR, selected?.getFullYear() ?? FIRST_YEAR)
  const lastYear = Math.max(now.getFullYear() + YEARS_AHEAD, selected?.getFullYear() ?? 0)

  // Each opening shows the field's month (or today's). The calendar may still be mounted from
  // the last opening (closing animation), so its own default month can't be relied on.
  function openCalendar(next: boolean): void {
    if (next) setMonth(selected ?? new Date())
    setOpen(next)
  }

  function pick(day: Date | undefined): void {
    // Picking the selected day again "deselects" it in the calendar: keep the date, just close.
    if (!day) {
      setOpen(false)
      return
    }
    const iso = dateToIso(day)
    setText(isoToDisplay(iso))
    setSeen(iso)
    onValueChange(iso)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={openCalendar}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            {...props}
            ref={(node) => {
              inputRef.current = node
              if (typeof ref === 'function') ref(node)
              else if (ref) ref.current = node
            }}
            dir="ltr"
            inputMode="numeric"
            placeholder="DD/MM/YYYY"
            autoComplete="off"
            disabled={disabled}
            // The field is always LTR with the date on the right; the icon sits on the left.
            className={cn('pl-9 text-right', className)}
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
            onKeyDown={(e) => {
              if (e.altKey && e.key === 'ArrowDown') {
                e.preventDefault()
                openCalendar(true)
              }
              onKeyDown?.(e)
            }}
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label="اختر التاريخ من التقويم"
              title="اختر التاريخ من التقويم"
              className="absolute inset-y-0 left-0 flex w-9 items-center justify-center rounded-l-md text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <CalendarDays className="size-4" />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-auto p-0"
        dir="rtl"
        data-testid="date-calendar"
        // Focus goes to the selected day (or today), the grid's one tab stop, so arrows work
        // at once; and back to the field when the calendar closes.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          const content = e.currentTarget as HTMLElement
          content.querySelector<HTMLElement>('.rdp-month_grid button[tabindex="0"]')?.focus()
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <Calendar
          mode="single"
          dir="rtl"
          selected={selected}
          month={month}
          onMonthChange={setMonth}
          onSelect={pick}
          captionLayout="dropdown"
          startMonth={new Date(firstYear, 0)}
          endMonth={new Date(lastYear, 11)}
          weekStartsOn={WEEK_STARTS_ON}
          locale={calendarLocale}
          formatters={calendarFormatters}
          labels={calendarLabels}
        />
      </PopoverContent>
    </Popover>
  )
})
