import { beforeEach, describe, expect, it } from 'vitest'
import { apiMethods } from '@shared/api'
import { errorMessageAr } from '@shared/errors'
import type { Db } from './db/client'
import { openTestDb } from './db/test-db'
import { createHandlers, toResult, toResultAsync, type Handlers } from './handlers'
import { updateVessel } from './services/vessels'
import { sampleDocument } from './services/test-fixtures'

let db: Db
let handlers: Handlers
let printed: number[]
let exported: string[]

beforeEach(() => {
  db = openTestDb()
  printed = []
  exported = []
  handlers = createHandlers(db, {
    print: {
      print: async (id) => {
        printed.push(id)
        return { printed: true }
      },
      savePdf: async (id) => ({ path: `${id}.pdf` })
    },
    export: {
      excel: async (id) => {
        exported.push(`excel ${id}`)
        return { path: `${id}.xlsx` }
      },
      word: async (id) => {
        exported.push(`word ${id}`)
        return null
      }
    }
  })
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

  it('reads a saved document, also after its vessel is deactivated', () => {
    const vessel = handlers.vessels.create(
      { name: 'MT B', prefix: 'B', arrivalDate: null, isActive: true },
      { makeActive: true }
    )
    const input = sampleDocument(vessel.id, { seals: ['S1', 'S2', 'S3'] })
    const { id } = handlers.documents.create(input, {})
    updateVessel(db, vessel.id, { isActive: false })

    expect(handlers.documents.get(id)).toEqual({ ...input, id, serialNo: 'B00001' })
    expect(toResult(() => handlers.documents.get(999))).toEqual({
      ok: false,
      code: 'DOCUMENT_NOT_FOUND'
    })
  })

  it('returns the customs agents from settings', () => {
    const agents = handlers.settings.getCustomsAgents()
    expect(agents.customsAgent1).toContain('معبر التنف')
    expect(agents.customsAgent2).toContain('معبر الوليد')
  })

  it('passes valid ids to the print service and rejects others', async () => {
    await expect(handlers.print.print(3)).resolves.toEqual({ printed: true })
    expect(printed).toEqual([3])
    expect(await toResultAsync(() => handlers.print.savePdf(-1))).toEqual({
      ok: false,
      code: 'INVALID_DATA'
    })
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

  it('passes valid ids to the export service and rejects others', async () => {
    await expect(handlers.export.excel(4)).resolves.toEqual({ path: '4.xlsx' })
    await expect(handlers.export.word(5)).resolves.toBeNull()
    expect(exported).toEqual(['excel 4', 'word 5'])
    for (const bad of [0, 1.5, '2' as unknown as number]) {
      expect(await toResultAsync(() => handlers.export.word(bad))).toEqual({
        ok: false,
        code: 'INVALID_DATA'
      })
    }
    expect(exported).toHaveLength(2)
  })
})
