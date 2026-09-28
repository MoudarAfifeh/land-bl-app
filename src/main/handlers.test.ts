import { beforeEach, describe, expect, it } from 'vitest'
import { apiMethods, type BackupStatus } from '@shared/api'
import { errorMessageAr } from '@shared/errors'
import type { Db } from './db/client'
import { openTestDb } from './db/test-db'
import { createHandlers, toResult, toResultAsync, type Handlers } from './handlers'
import { updateVessel } from './services/vessels'
import { sampleDocument } from './services/test-fixtures'

const backupStatus: BackupStatus = {
  folder: 'D:\\LandBL-Backups',
  lastBackupAt: null,
  lastBackupPath: null,
  lastError: null,
  age: 'none',
  sameDriveAsData: false
}

let db: Db
let handlers: Handlers
let printed: number[]
let exported: string[]
let restored: string[]

beforeEach(() => {
  db = openTestDb()
  printed = []
  exported = []
  restored = []
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
    },
    backup: {
      status: async () => backupStatus,
      chooseFolder: async () => null,
      runNow: async () => backupStatus,
      pickRestoreFile: async () => null,
      restore: async (file) => {
        restored.push(file)
      }
    }
  })
})

describe('ipc handlers', () => {
  it('has a handler for every api method but the license ones (license/gate.ts)', () => {
    for (const [group, methods] of Object.entries(apiMethods)) {
      if (group === 'license') continue
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

    expect(handlers.documents.get(id)).toEqual({
      ...input,
      ...handlers.settings.getCustomsAgents(),
      id,
      serialNo: 'B00001',
      deletedAt: null
    })
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

  it('lists, filters and soft-deletes documents; lists inactive vessels too', () => {
    const a = handlers.vessels.create(
      { name: 'MT A', prefix: 'A', arrivalDate: null, isActive: true },
      { makeActive: true }
    )
    const b = handlers.vessels.create(
      { name: 'MT Z', prefix: 'Z', arrivalDate: null, isActive: true },
      { makeActive: false }
    )
    updateVessel(db, b.id, { isActive: false })
    expect(handlers.vessels.listAll().map((v) => v.prefix)).toEqual(['A', 'Z'])
    expect(handlers.vessels.listActive().map((v) => v.prefix)).toEqual(['A'])

    const first = handlers.documents.create(sampleDocument(a.id, { driverName: 'خالد' }), {})
    handlers.documents.create(sampleDocument(a.id), {})
    expect(handlers.documents.list({ search: 'خالد' }).rows.map((r) => r.id)).toEqual([first.id])

    handlers.documents.softDelete(first.id)
    expect(handlers.documents.list({}).total).toBe(1)
    expect(handlers.documents.list({ includeDeleted: true }).total).toBe(2)
    expect(toResult(() => handlers.documents.softDelete(-1))).toEqual({
      ok: false,
      code: 'INVALID_DATA'
    })
    expect(toResult(() => handlers.documents.list({ pageSize: 1000 }))).toEqual({
      ok: false,
      code: 'INVALID_DATA'
    })
  })
})

describe('settings handlers', () => {
  it('edits vessels and sets the current one', () => {
    const a = handlers.vessels.create(
      { name: 'MT A', prefix: 'A', arrivalDate: null, isActive: true },
      { makeActive: false }
    )
    handlers.documents.create(sampleDocument(a.id), {})
    handlers.vessels.setActive(a.id)
    expect(handlers.vessels.update(a.id, { ...a, name: 'MT A2' }).name).toBe('MT A2')
    expect(handlers.vessels.listWithCounts()).toMatchObject([
      { id: a.id, name: 'MT A2', documentCount: 1, isCurrent: true, lastSerial: 'A00001' }
    ])
    expect(toResult(() => handlers.vessels.update(a.id, { ...a, prefix: 'B' }))).toEqual({
      ok: false,
      code: 'PREFIX_LOCKED'
    })
    expect(toResult(() => handlers.vessels.setActive(0))).toEqual({
      ok: false,
      code: 'INVALID_DATA'
    })
  })

  it('edits lookups and reports duplicates as a code', () => {
    const p = handlers.lookups.createParty({ name: 'شركة', address: null })
    expect(toResult(() => handlers.lookups.createParty({ name: ' شركة ', address: null }))).toEqual(
      { ok: false, code: 'LOOKUP_DUPLICATE' }
    )
    handlers.lookups.updateParty(p.id, { name: 'شركة 2', address: 'دمشق' })
    handlers.lookups.deleteParty(p.id)
    expect(handlers.lookups.listParties()).toEqual([])
    const t = handlers.lookups.createTanker({ tankerNo: 'T1' })
    expect(handlers.lookups.updateTanker(t.id, { tankerNo: 'T2' }).tankerNo).toBe('T2')
    const d = handlers.lookups.createDriver({ name: 'سائق', passportNo: 'P' })
    handlers.lookups.deleteDriver(d.id)
    expect(toResult(() => handlers.lookups.deleteDriver(d.id))).toEqual({
      ok: false,
      code: 'LOOKUP_NOT_FOUND'
    })
  })

  it('saves the customs agents', () => {
    handlers.settings.setCustomsAgents({ customsAgent1: 'أ', customsAgent2: 'ب' })
    expect(handlers.settings.getCustomsAgents()).toEqual({ customsAgent1: 'أ', customsAgent2: 'ب' })
  })

  it('passes backups to the backup service and checks the restore file', async () => {
    await expect(handlers.backup.status()).resolves.toEqual(backupStatus)
    await handlers.backup.restore('D:\b.sqlite')
    expect(await toResultAsync(() => handlers.backup.restore(''))).toEqual({
      ok: false,
      code: 'INVALID_DATA'
    })
    expect(restored).toEqual(['D:\b.sqlite'])
  })
})
