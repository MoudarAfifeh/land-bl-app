/**
 * What the print view shows: every printed value as display text, 12 seal slots and the two
 * customs agent blocks. Built from a saved document or from the wizard's current values.
 */
import { documentFields, MAX_SEALS } from '@shared/fields'
import type { CustomsAgents } from '@shared/api'
import { displayValue } from '@shared/format'
import type { AgentKey, ValueFieldKey } from './print-layout'

export interface PrintData {
  values: Record<ValueFieldKey, string>
  /** Always 12 entries; empty slots are ''. */
  seals: string[]
  agents: Record<AgentKey, string>
}

/** A document as stored, or as typed in the form (serial not assigned yet). */
export type PrintSource = {
  [K in ValueFieldKey]: string | number | null | undefined
} & { seals: readonly string[] }

const valueFields = documentFields.filter(
  (f): f is Extract<(typeof documentFields)[number], { key: ValueFieldKey }> =>
    f.print && f.type !== 'stringList'
)

export function toPrintData(source: PrintSource, agents: CustomsAgents): PrintData {
  const values = Object.fromEntries(
    valueFields.map((f) => [f.key, displayValue(f.type, source[f.key])])
  ) as Record<ValueFieldKey, string>
  const filled = source.seals.map((s) => s.trim()).filter(Boolean)
  const seals = Array.from({ length: MAX_SEALS }, (_, i) => filled[i] ?? '')
  return {
    values,
    seals,
    agents: {
      customsAgent1: agents.customsAgent1?.trim() ?? '',
      customsAgent2: agents.customsAgent2?.trim() ?? ''
    }
  }
}
