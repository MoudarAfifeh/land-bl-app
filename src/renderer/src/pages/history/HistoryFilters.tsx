import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { VesselSummary } from '@shared/api'
import { DateInput } from '@/components/form/DateInput'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { HistoryParam } from './history-params'

const SEARCH_DELAY_MS = 250
const ALL_VESSELS = 'all'
const ISO = /^\d{4}-\d{2}-\d{2}$/

interface Props {
  search: string
  vesselId: number | null
  from: string | null
  to: string | null
  includeDeleted: boolean
  vessels: VesselSummary[]
  onChange: (changes: Partial<Record<HistoryParam, string | null>>) => void
}

/** Search box, vessel, issue date range and "show deleted". */
export function HistoryFilters(props: Props): React.JSX.Element {
  const { vessels, onChange } = props
  const [text, setText] = useState(props.search)
  const [seen, setSeen] = useState(props.search)
  const timer = useRef<number | undefined>(undefined)

  // The URL changed from outside (back button, cleared filters): show it. Not when it is just
  // our own trimmed text coming back, so a trailing space isn't eaten while typing.
  if (props.search !== seen) {
    setSeen(props.search)
    if (props.search !== text.trim()) setText(props.search)
  }

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function typeSearch(value: string): void {
    setText(value)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onChange({ q: value.trim() }), SEARCH_DELAY_MS)
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-64 flex-1 flex-col gap-1.5">
        <Label htmlFor="history-search">بحث</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <Input
            id="history-search"
            type="search"
            className="ps-9"
            placeholder="رقم البوليصة، السائق، الصهريج، الجهة المرسلة أو المرسل إليها"
            value={text}
            onChange={(e) => typeSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex w-48 flex-col gap-1.5">
        <Label htmlFor="history-vessel">الباخرة</Label>
        <Select
          value={props.vesselId === null ? ALL_VESSELS : String(props.vesselId)}
          onValueChange={(v) => onChange({ vessel: v === ALL_VESSELS ? null : v })}
        >
          <SelectTrigger id="history-vessel" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VESSELS}>كل البواخر</SelectItem>
            {vessels.map((v) => (
              <SelectItem key={v.id} value={String(v.id)}>
                {v.name} ({v.prefix}){v.isActive ? '' : ' — غير نشطة'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DateFilter
        id="history-from"
        label="من تاريخ"
        value={props.from}
        onChange={(v) => onChange({ from: v })}
      />
      <DateFilter
        id="history-to"
        label="إلى تاريخ"
        value={props.to}
        onChange={(v) => onChange({ to: v })}
      />

      <div className="flex h-9 items-center gap-2">
        <Checkbox
          id="history-deleted"
          checked={props.includeDeleted}
          onCheckedChange={(checked) => onChange({ deleted: checked === true ? '1' : null })}
        />
        <Label htmlFor="history-deleted">إظهار المحذوفة</Label>
      </div>
    </div>
  )
}

/** A date bound: applied once it is a real date or cleared; partial typing is kept locally. */
function DateFilter({
  id,
  label,
  value,
  onChange
}: {
  id: string
  label: string
  value: string | null
  onChange: (iso: string | null) => void
}): React.JSX.Element {
  const [local, setLocal] = useState(value ?? '')
  const [seen, setSeen] = useState(value)

  // Changed from outside (back button): show it. Partial typing stays local until it's a date.
  if (value !== seen) {
    setSeen(value)
    if ((value ?? '') !== local) setLocal(value ?? '')
  }

  return (
    <div className="flex w-44 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <DateInput
        id={id}
        value={local}
        onValueChange={(v) => {
          setLocal(v)
          if (v === '' || ISO.test(v)) onChange(v === '' ? null : v)
        }}
      />
    </div>
  )
}
