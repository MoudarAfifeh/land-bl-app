import { stepFieldKeys } from '@shared/fields'
import { FieldFor } from './controls'
import type { DateKey, NumberKey, StringKey } from './form'

/** Every step-3 field is a plain text or number input, in fields.ts order. */
const keys = stepFieldKeys(3) as (StringKey | NumberKey | DateKey)[]

export function Step3Quality(): React.JSX.Element {
  return (
    <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
      {keys.map((key) => (
        <FieldFor key={key} name={key} />
      ))}
    </div>
  )
}
