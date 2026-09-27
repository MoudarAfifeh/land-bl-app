import { describe, expect, it } from 'vitest'
import { paramsToQuery, withParams } from './history-params'

const params = (s: string): URLSearchParams => new URLSearchParams(s)

describe('history URL params', () => {
  it('reads an empty URL as the default query', () => {
    expect(paramsToQuery(params(''))).toEqual({
      search: '',
      vesselId: null,
      from: null,
      to: null,
      includeDeleted: false,
      page: 1
    })
  })

  it('reads every filter', () => {
    expect(
      paramsToQuery(params('q=محمد&vessel=3&from=2026-01-01&to=2026-01-31&deleted=1&page=4'))
    ).toEqual({
      search: 'محمد',
      vesselId: 3,
      from: '2026-01-01',
      to: '2026-01-31',
      includeDeleted: true,
      page: 4
    })
  })

  it('ignores values main would reject', () => {
    expect(paramsToQuery(params('vessel=abc&from=27/09/2026&to=2026-13-40&page=-2'))).toMatchObject(
      {
        vesselId: null,
        from: null,
        to: null,
        page: 1
      }
    )
  })

  it('changes a filter and goes back to page 1', () => {
    const next = withParams(params('q=a&page=3&vessel=2'), { q: 'b' })
    expect(next.toString()).toBe('q=b&vessel=2')
  })

  it('drops empty values', () => {
    expect(withParams(params('q=a&vessel=2'), { q: '', vessel: null }).toString()).toBe('')
  })

  it('keeps the other filters when only the page changes', () => {
    expect(withParams(params('q=a'), { page: '2' }).toString()).toBe('q=a&page=2')
    expect(withParams(params('q=a&page=2'), { page: '1' }).toString()).toBe('q=a')
  })
})
