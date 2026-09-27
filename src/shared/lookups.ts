/**
 * Matching rules for lookup lists (parties, drivers, tankers), shared by main (saving) and the
 * renderer (autocomplete, "update stored value" checkboxes) so both sides agree.
 */

export interface Party {
  id: number
  name: string
  address: string | null
}

export interface Driver {
  id: number
  name: string
  passportNo: string | null
}

export interface Tanker {
  id: number
  tankerNo: string
}

/** Trims and collapses inner whitespace: the form a name is stored in. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/** Comparison key: normalized and case-insensitive. */
export function nameKey(name: string): string {
  return normalizeName(name).toLowerCase()
}

/** The first item whose name matches, ignoring case and extra spaces. */
export function findByName<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  name: string
): T | undefined {
  const key = nameKey(name)
  if (key === '') return undefined
  return items.find((item) => nameKey(nameOf(item)) === key)
}

function blankToNull(value: string | null | undefined): string | null {
  const v = value?.trim() ?? ''
  return v === '' ? null : v
}

/**
 * True when the document's value would replace a different stored value. Only then does the user
 * get the "update stored value" choice; a blank on either side is never a conflict.
 */
export function differsFromStored(
  documentValue: string | null | undefined,
  storedValue: string | null | undefined
): boolean {
  const doc = blankToNull(documentValue)
  const stored = blankToNull(storedValue)
  return doc !== null && stored !== null && doc !== stored
}

/**
 * The value to store for an existing lookup entry: fills a blank, and replaces a different value
 * only when the user asked to. Returns undefined when nothing should change.
 */
export function nextStoredValue(
  documentValue: string | null | undefined,
  storedValue: string | null | undefined,
  replace: boolean
): string | undefined {
  const doc = blankToNull(documentValue)
  if (doc === null) return undefined
  if (blankToNull(storedValue) === null) return doc
  return replace && differsFromStored(doc, storedValue) ? doc : undefined
}
