/**
 * The history filters live in the URL (/history?q=…&vessel=…&page=2), so coming back from a
 * document shows the same list. Values main would reject are ignored rather than sent.
 */
import type { DocumentListQuery } from '@shared/schemas'
import { displayToIso, isoToDisplay } from '@/lib/format'

export type HistoryParam = 'q' | 'vessel' | 'from' | 'to' | 'deleted' | 'page'

const isRealIsoDate = (v: string | null): v is string =>
  v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v) && displayToIso(isoToDisplay(v)) === v

const positiveInt = (v: string | null): number | null =>
  v !== null && /^[1-9]\d*$/.test(v) ? Number(v) : null

export function paramsToQuery(
  params: URLSearchParams
): Required<Omit<DocumentListQuery, 'pageSize'>> {
  const from = params.get('from')
  const to = params.get('to')
  return {
    search: params.get('q') ?? '',
    vesselId: positiveInt(params.get('vessel')),
    from: isRealIsoDate(from) ? from : null,
    to: isRealIsoDate(to) ? to : null,
    includeDeleted: params.get('deleted') === '1',
    page: positiveInt(params.get('page')) ?? 1
  }
}

/**
 * New params with some values changed ('' or null removes one). Changing a filter goes back to
 * page 1; page 1 itself is left out of the URL.
 */
export function withParams(
  current: URLSearchParams,
  changes: Partial<Record<HistoryParam, string | null>>
): URLSearchParams {
  const next = new URLSearchParams(current)
  if (!('page' in changes)) next.delete('page')
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '' || (key === 'page' && value === '1')) next.delete(key)
    else next.set(key, value)
  }
  return next
}
