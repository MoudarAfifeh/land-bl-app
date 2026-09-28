import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ServiceError } from '@shared/errors'
import { encodeLicense, type LicensePayload } from './codec'
import { createLicenseManager, LICENSE_FILE, LICENSE_STATE_FILE } from './manager'

const keys = generateKeyPairSync('ed25519')
const MACHINE = '7F3A92C10B4ED8A5'

const license = (over: Partial<LicensePayload> = {}): string =>
  encodeLicense(
    {
      v: 1,
      product: 'land-bl',
      machineId: MACHINE,
      customerName: 'مكتب التخليص',
      issuedAt: '2026-09-01',
      expiresAt: null,
      ...over
    },
    keys.privateKey
  )

const day = (iso: string, hour = 12): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, hour)
}

let dir: string
let now: Date

const manager = (machineId: string | null = MACHINE): ReturnType<typeof createLicenseManager> =>
  createLicenseManager({
    dir,
    publicKey: keys.publicKey,
    readMachineId: () => machineId,
    now: () => now
  })

function codeOf(run: () => unknown): string | undefined {
  try {
    run()
  } catch (e) {
    return e instanceof ServiceError ? e.code : String(e)
  }
  return undefined
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'land-bl-license-'))
  now = day('2026-09-28')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('license manager', () => {
  it('is inactive with no error and shows the machine code before activation', () => {
    expect(manager().check()).toEqual({
      active: false,
      error: null,
      machineCode: '7F3A-92C1-0B4E-D8A5',
      customerName: null,
      issuedAt: null,
      expiresAt: null,
      daysLeft: null
    })
  })

  it('activates with a valid license, stores it, and stays active on the next start', () => {
    const status = manager().activate(license({ expiresAt: '2026-10-28' }))
    expect(status).toEqual({
      active: true,
      error: null,
      machineCode: '7F3A-92C1-0B4E-D8A5',
      customerName: 'مكتب التخليص',
      issuedAt: '2026-09-01',
      expiresAt: '2026-10-28',
      daysLeft: 30
    })
    expect(existsSync(join(dir, LICENSE_FILE))).toBe(true)
    expect(manager().check().active).toBe(true)
  })

  it('refuses a license for another machine and stores nothing', () => {
    expect(codeOf(() => manager().activate(license({ machineId: '0000111122223333' })))).toBe(
      'LICENSE_WRONG_MACHINE'
    )
    expect(existsSync(join(dir, LICENSE_FILE))).toBe(false)
  })

  it('keeps the working license when a bad renewal is pasted', () => {
    manager().activate(license({ customerName: 'Office A' }))
    expect(codeOf(() => manager().activate('garbage'))).toBe('LICENSE_INVALID')
    expect(manager().check()).toMatchObject({ active: true, customerName: 'Office A' })
  })

  it('replaces the license with a valid renewal', () => {
    manager().activate(license({ expiresAt: '2026-10-01' }))
    manager().activate(license({ expiresAt: '2027-10-01' }))
    expect(manager().check()).toMatchObject({ active: true, expiresAt: '2027-10-01' })
  })

  it('reports an expired stored license with its details', () => {
    manager().activate(license({ expiresAt: '2026-09-30' }))
    now = day('2026-10-01')
    expect(manager().check()).toMatchObject({
      active: false,
      error: 'LICENSE_EXPIRED',
      customerName: 'مكتب التخليص',
      expiresAt: '2026-09-30',
      daysLeft: -1
    })
  })

  it('reports a stored file that was edited as invalid', () => {
    manager().activate(license())
    writeFileSync(join(dir, LICENSE_FILE), 'edited')
    expect(manager().check()).toMatchObject({ active: false, error: 'LICENSE_INVALID' })
  })

  it('refuses while the clock is set back, and works again once it is fixed', () => {
    manager().activate(license())
    now = day('2026-10-20')
    expect(manager().check().active).toBe(true)

    now = day('2026-10-10')
    expect(manager().check()).toMatchObject({ active: false, error: 'LICENSE_CLOCK_ROLLBACK' })
    // The rolled-back date is never recorded as the latest one.
    const state = JSON.parse(readFileSync(join(dir, LICENSE_STATE_FILE), 'utf8'))
    expect(new Date(state.lastSeen).getTime()).toBe(day('2026-10-20').getTime())
    expect(codeOf(() => manager().activate(license()))).toBe('LICENSE_CLOCK_ROLLBACK')

    now = day('2026-10-20', 13)
    expect(manager().check().active).toBe(true)
  })

  it('treats a damaged state file as missing: the issue date is still a floor', () => {
    manager().activate(license({ issuedAt: '2026-09-20' }))
    writeFileSync(join(dir, LICENSE_STATE_FILE), '{not json')
    now = day('2026-09-10')
    expect(manager().check().error).toBe('LICENSE_CLOCK_ROLLBACK')
  })

  it('cannot activate when the machine ID is unreadable', () => {
    const m = manager(null)
    expect(m.check()).toMatchObject({
      active: false,
      error: 'LICENSE_MACHINE_ID_UNAVAILABLE',
      machineCode: null
    })
    expect(codeOf(() => m.activate(license()))).toBe('LICENSE_MACHINE_ID_UNAVAILABLE')
  })

  it('refuses a non-text license', () => {
    expect(codeOf(() => manager().activate(42 as unknown as string))).toBe('LICENSE_INVALID')
  })
})
