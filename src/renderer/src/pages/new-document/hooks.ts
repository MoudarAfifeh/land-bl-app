import { useCallback, useEffect, useRef, useState } from 'react'
import { get, useFormState, useWatch, type UseFormReturn } from 'react-hook-form'
import type { VesselSummary } from '@shared/api'
import type { DocumentInput } from '@shared/schemas'
import { errorMessageAr } from '@shared/errors'
import {
  differsFromStored,
  findByName,
  type Driver,
  type Party,
  type Tanker
} from '@shared/lookups'
import { copiedFields, type FormValues, type StringKey } from './form'

export interface WizardData {
  vessels: VesselSummary[]
  activeVessel: VesselSummary | null
  parties: Party[]
  drivers: Driver[]
  tankers: Tanker[]
}

async function loadWizardData(): Promise<WizardData> {
  const [vessels, activeVessel, parties, drivers, tankers] = await Promise.all([
    window.api.vessels.listActive(),
    window.api.vessels.getActive(),
    window.api.lookups.listParties(),
    window.api.lookups.listDrivers(),
    window.api.lookups.listTankers()
  ])
  return { vessels, activeVessel, parties, drivers, tankers }
}

/** Vessels and lookup lists for the wizard; `reload` after saving picks up new names. */
export function useWizardData(): {
  data: WizardData | null
  error: string | null
  reload: () => Promise<WizardData>
} {
  const [data, setData] = useState<WizardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const fresh = await loadWizardData()
    setData(fresh)
    return fresh
  }, [])

  useEffect(() => {
    let cancelled = false
    loadWizardData().then(
      (fresh) => !cancelled && setData(fresh),
      (e: unknown) => !cancelled && setError(errorMessageAr(e))
    )
    return () => {
      cancelled = true
    }
  }, [])

  return { data, error, reload }
}

export function useFieldError(name: string): string | undefined {
  const { errors } = useFormState<FormValues>({ name: name as keyof FormValues })
  return (get(errors, name) as { message?: string } | undefined)?.message
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Keeps copied defaults (transport date ← issue date) in step with their source until the user
 * edits the copy. Returns a function to call after resetting the form.
 */
export function useFollowCopies(
  form: UseFormReturn<FormValues, unknown, DocumentInput>
): () => void {
  const edited = useRef(new Set<string>())

  useEffect(() => {
    const targets = new Set<string>(copiedFields.map((c) => c.key))
    const sub = form.watch((values, { name, type }) => {
      if (!name) return
      if (type === 'change' && targets.has(name)) edited.current.add(name)
      for (const c of copiedFields) {
        const source = values[c.from]
        if (name === c.from && !edited.current.has(c.key) && typeof source === 'string') {
          if (source === '' || ISO.test(source)) form.setValue(c.key, source as never)
        }
      }
    })
    return () => sub.unsubscribe()
  }, [form])

  return useCallback(() => edited.current.clear(), [])
}

/**
 * The stored value of the lookup entry named in `nameKey` when it differs from the document's
 * `valueKey`, else null. Drives the "update stored value" checkboxes.
 */
export function useStoredConflict<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  valueOf: (item: T) => string | null,
  nameKey: StringKey,
  valueKey: StringKey
): string | null {
  const [name, value] = useWatch<FormValues, [StringKey, StringKey]>({ name: [nameKey, valueKey] })
  const match = findByName(items, nameOf, name ?? '')
  const stored = match ? valueOf(match) : null
  return differsFromStored(value, stored) ? stored : null
}
