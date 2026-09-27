import { beforeEach, describe, expect, it } from 'vitest'
import { apiMethods } from '@shared/api'
import { errorMessageAr } from '@shared/errors'
import type { Db } from './db/client'
import { openTestDb } from './db/test-db'
import { createHandlers, toResult, type Handlers } from './handlers'
import { sampleDocument } from './services/test-fixtures'

let db: Db
let handlers: Handlers

beforeEach(() => {
  db = openTestDb()
  handlers = createHandlers(db)
})

describe('ipc handlers', () => {
  it('has a handler for every api method', () => {
    for (const [group, methods] of Object.entries(apiMethods)) {
      for (const method of methods) {
        const groupHandlers = handlers[group as keyof Handlers] as Record<string, unknown>
        expect(typeof groupHandlers[method], `${group}.${method}`).toBe('function')
      }
    }
  })

  it('creates a vessel and a document, returning the serial', () => {
    const vessel = handlers.vessels.create(
      { name: 'MT A', prefix: 'A', arrivalDate: null, isActive: true },
      { makeActive: true }
    )
    expect(handlers.vessels.getActive()?.id).toBe(vessel.id)
    expect(handlers.vessels.listActive()).toHaveLength(1)

    const created = handlers.documents.create(sampleDocument(vessel.id), {})
    expect(created).toEqual({ id: 1, serialNo: 'A00001' })
    expect(handlers.lookups.listTankers()).toHaveLength(1)
  })
})

describe('toResult', () => {
  it('turns service and validation errors into codes', () => {
    const inactive = toResult(() => handlers.documents.create(sampleDocument(999), {}))
    expect(inactive).toEqual({ ok: false, code: 'VESSEL_NOT_FOUND' })

    const invalid = toResult(() =>
      handlers.documents.create(sampleDocument(1, { shipperName: '' }), {})
    )
    expect(invalid).toEqual({ ok: false, code: 'INVALID_DATA' })
  })

  it('maps codes to Arabic messages on the renderer side', () => {
    expect(errorMessageAr(new Error('VESSEL_INACTIVE'))).toBe(
      'الباخرة غير نشطة ولا يمكن إصدار وثائق جديدة لها'
    )
    expect(errorMessageAr(new Error('boom'))).toBe('حدث خطأ غير متوقع')
  })
})
