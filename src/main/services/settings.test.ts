import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { openTestDb } from '../db/test-db'
import { getCustomsAgents, setCustomsAgents } from './settings'

let db: Db

beforeEach(() => {
  db = openTestDb()
})

describe('customs agents', () => {
  it('saves both blocks, trimmed, keeping inner line breaks; blank means none', () => {
    const text = ['المخلص السوري', 'شركة الحسن', '0963'].join(String.fromCharCode(10))
    expect(setCustomsAgents(db, { customsAgent1: `  ${text} `, customsAgent2: '  ' })).toEqual({
      customsAgent1: text,
      customsAgent2: null
    })
    expect(getCustomsAgents(db)).toEqual({ customsAgent1: text, customsAgent2: null })
  })
})
