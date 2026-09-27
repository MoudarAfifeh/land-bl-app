import { describe, expect, it } from 'vitest'
import { API_KEY } from './api'

describe('api contract', () => {
  it('is exposed on window under the "api" key', () => {
    expect(API_KEY).toBe('api')
  })
})
