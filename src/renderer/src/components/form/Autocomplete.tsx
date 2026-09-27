import * as React from 'react'
import { nameKey } from '@shared/lookups'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface AutocompleteOption {
  id: number
  label: string
  /** Secondary text, e.g. a party's address or a driver's passport. */
  hint?: string | null
}

interface AutocompleteProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'id'
> {
  id: string
  value: string
  onValueChange: (value: string) => void
  options: readonly AutocompleteOption[]
  onPick: (option: AutocompleteOption) => void
}

const MAX_SHOWN = 8

/**
 * Free-text input with suggestions (new names are allowed). Arrow keys move, Enter picks the
 * highlighted suggestion, Esc closes. When nothing is highlighted, Enter is left to the form.
 */
export const Autocomplete = React.forwardRef<HTMLInputElement, AutocompleteProps>(
  function Autocomplete(
    { id, value, onValueChange, options, onPick, onBlur, onFocus, className, ...props },
    ref
  ) {
    const [open, setOpen] = React.useState(false)
    const [active, setActive] = React.useState(-1)

    const key = nameKey(value)
    const matches = React.useMemo(
      () =>
        (key === '' ? options : options.filter((o) => nameKey(o.label).includes(key))).slice(
          0,
          MAX_SHOWN
        ),
      [options, key]
    )
    const exactOnly = matches.length === 1 && nameKey(matches[0].label) === key
    const shown = open && matches.length > 0 && !exactOnly
    const listId = `${id}-list`

    function pick(option: AutocompleteOption): void {
      onPick(option)
      setOpen(false)
      setActive(-1)
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
        setActive((a) => Math.min(a + 1, matches.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => Math.max(a - 1, 0))
      } else if (e.key === 'Enter' && shown && active >= 0 && matches[active]) {
        e.preventDefault()
        pick(matches[active])
      } else if (e.key === 'Escape' && shown) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        setActive(-1)
      }
    }

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shown}
          aria-controls={shown ? listId : undefined}
          aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className={className}
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={(e) => {
            setOpen(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setOpen(false)
            setActive(-1)
            onBlur?.(e)
          }}
          onKeyDown={onKeyDown}
        />
        {shown && (
          <ul
            id={listId}
            role="listbox"
            className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {matches.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={cn(
                  'flex cursor-default flex-col rounded-sm px-2 py-1.5 text-sm',
                  i === active && 'bg-accent text-accent-foreground'
                )}
                // mousedown, not click: the input would blur and close the list first.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(o)
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span>{o.label}</span>
                {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
)
