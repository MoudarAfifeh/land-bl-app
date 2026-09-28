import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiMethods, isUngatedGroup, UNGATED_GROUPS, type Api } from '@shared/api'
import type { Handlers } from '../handlers'
import { encodeLicense } from './codec'
import { createGate, type Gate } from './gate'
import { createLicenseManager } from './manager'

const keys = generateKeyPairSync('ed25519')
const MACHINE = '7F3A92C10B4ED8A5'

const license = (expiresAt: string | null = null): string =>
  encodeLicense(
    {
      v: 1,
      product: 'land-bl',
      machineId: MACHINE,
      customerName: 'Office',
      issuedAt: '2026-09-01',
      expiresAt
    },
    keys.privateKey
  )

/** Every app handler answers with its own channel name. */
function fakeHandlers(): Handlers {
  return Object.fromEntries(
    Object.entries(apiMethods)
      .filter(([group]) => !isUngatedGroup(group))
      .map(([group, methods]) => [
        group,
        Object.fromEntries(methods.map((m) => [m, () => `${group}.${m}`]))
      ])
  ) as unknown as Handlers
}

const appChannels = Object.entries(apiMethods)
  .filter(([group]) => !isUngatedGroup(group))
  .flatMap(([group, methods]) => methods.map((method) => [group, method] as const))

let dir: string
let now: Date
let built: number
let closed: number
let copied: string[]
let logsOpened: number
let gate: Gate

const appInfo = { version: '1.0.0', dataFolder: 'C:/data', logsFolder: 'C:/data/logs' }

/** The `app` group as index.ts builds it: no database involved. */
function appHandlers(): Api['app'] {
  return {
    info: async () => appInfo,
    openLogsFolder: async () => {
      logsOpened++
    }
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'land-bl-gate-'))
  now = new Date(2026, 8, 28, 12)
  built = 0
  closed = 0
  copied = []
  logsOpened = 0
  gate = createGate({
    app: appHandlers(),
    manager: createLicenseManager({
      dir,
      publicKey: keys.publicKey,
      readMachineId: () => MACHINE,
      now: () => now
    }),
    buildHandlers: () => {
      built++
      return fakeHandlers()
    },
    copyText: (text) => copied.push(text),
    onClose: () => closed++
  })
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('license gate', () => {
  it('refuses every app handler before activation, without opening the database', async () => {
    expect(gate.refresh()).toBe(false)
    expect(appChannels.length).toBeGreaterThan(30)
    for (const [group, method] of appChannels) {
      expect(await gate.dispatch(group, method, []), `${group}.${method}`).toEqual({
        ok: false,
        code: 'LICENSE_REQUIRED'
      })
    }
    expect(built).toBe(0)
  })

  it('answers the license handlers before activation', async () => {
    expect(await gate.dispatch('license', 'status', [])).toMatchObject({
      ok: true,
      data: { active: false, machineCode: '7F3A-92C1-0B4E-D8A5' }
    })
    expect(await gate.dispatch('license', 'copyMachineCode', [])).toEqual({
      ok: true,
      data: undefined
    })
    expect(copied).toEqual(['7F3A-92C1-0B4E-D8A5'])
    expect(await gate.dispatch('license', 'activate', ['nonsense'])).toEqual({
      ok: false,
      code: 'LICENSE_INVALID'
    })
    expect(built).toBe(0)
  })

  it('answers the app handlers (version, logs folder) before activation, database closed', async () => {
    expect(UNGATED_GROUPS).toEqual(['app', 'license'])
    expect(await gate.dispatch('app', 'info', [])).toEqual({ ok: true, data: appInfo })
    expect(await gate.dispatch('app', 'openLogsFolder', [])).toEqual({ ok: true, data: undefined })
    expect(logsOpened).toBe(1)
    expect(await gate.dispatch('app', 'drop', [])).toEqual({ ok: false, code: 'UNEXPECTED' })
    expect(built).toBe(0)
  })

  it('still answers the app handlers once open, and after the license stops', async () => {
    await gate.dispatch('license', 'activate', [license('2026-09-30')])
    expect(await gate.dispatch('app', 'info', [])).toEqual({ ok: true, data: appInfo })
    now = new Date(2026, 9, 1, 9)
    expect(gate.refresh()).toBe(false)
    expect(await gate.dispatch('app', 'openLogsFolder', [])).toEqual({ ok: true, data: undefined })
    expect(logsOpened).toBe(1)
  })

  it('opens on activation and builds the app handlers once', async () => {
    expect(await gate.dispatch('license', 'activate', [license()])).toMatchObject({
      ok: true,
      data: { active: true }
    })
    expect(await gate.dispatch('documents', 'list', [{}])).toEqual({
      ok: true,
      data: 'documents.list'
    })
    // A renewal or a status check doesn't build them again.
    await gate.dispatch('license', 'activate', [license('2027-01-01')])
    await gate.dispatch('license', 'status', [])
    expect(gate.refresh()).toBe(true)
    expect(built).toBe(1)
  })

  it('opens on start when a valid license is stored', async () => {
    await gate.dispatch('license', 'activate', [license()])
    const next = createGate({
      app: appHandlers(),
      manager: createLicenseManager({
        dir,
        publicKey: keys.publicKey,
        readMachineId: () => MACHINE,
        now: () => now
      }),
      buildHandlers: fakeHandlers,
      copyText: () => undefined,
      onClose: () => undefined
    })
    expect(next.refresh()).toBe(true)
    expect((await next.dispatch('vessels', 'listAll', [])).ok).toBe(true)
  })

  it('closes when the license expires while the app is open', async () => {
    await gate.dispatch('license', 'activate', [license('2026-09-30')])
    now = new Date(2026, 9, 1, 9)
    expect(gate.refresh()).toBe(false)
    expect(closed).toBe(1)
    expect(await gate.dispatch('documents', 'create', [{}, {}])).toEqual({
      ok: false,
      code: 'LICENSE_REQUIRED'
    })
    // Checking again while closed doesn't signal again.
    gate.refresh()
    expect(closed).toBe(1)
  })

  it('closes when the clock is set back, and reopens once it is fixed', async () => {
    await gate.dispatch('license', 'activate', [license()])
    now = new Date(2026, 8, 20)
    expect(await gate.dispatch('license', 'status', [])).toMatchObject({
      ok: true,
      data: { active: false, error: 'LICENSE_CLOCK_ROLLBACK' }
    })
    expect((await gate.dispatch('documents', 'list', [{}])).ok).toBe(false)
    now = new Date(2026, 8, 28, 13)
    expect(gate.refresh()).toBe(true)
    expect((await gate.dispatch('documents', 'list', [{}])).ok).toBe(true)
    expect(built).toBe(1)
  })

  it('refuses a channel that is not in the API', async () => {
    await gate.dispatch('license', 'activate', [license()])
    expect(await gate.dispatch('documents', 'drop', [])).toEqual({
      ok: false,
      code: 'UNEXPECTED'
    })
  })
})
