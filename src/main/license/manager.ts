/**
 * The stored license and the latest date seen, in two files in userData next to (not inside) the
 * database, so a backup or restore never touches them. No Electron: paths, key, machine ID and
 * clock are passed in.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { KeyLike } from 'node:crypto'
import type { LicenseStatus } from '@shared/api'
import { ServiceError } from '@shared/errors'
import { daysLeft, formatMachineCode, verifyLicense, type VerifyResult } from './codec'

/** The license text as pasted. */
export const LICENSE_FILE = 'license.lic'
/** `{ lastSeen }`: the latest date the app has seen, to detect a clock set back. */
export const LICENSE_STATE_FILE = 'license-state.json'

export interface LicenseManagerOptions {
  /** userData. */
  dir: string
  publicKey: KeyLike
  /** Read once, on first use; null if the MachineGuid can't be read. */
  readMachineId: () => string | null
  now?: () => Date
}

export interface LicenseManager {
  /** Checks the stored license against the clock now, and records the date. */
  check(): LicenseStatus
  /**
   * Verifies a pasted license and stores it. A refused one throws its error code and leaves the
   * stored license as it was.
   */
  activate(text: unknown): LicenseStatus
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** Temp file then rename, so a crash never leaves half a file. */
function writeAtomic(path: string, content: string): void {
  writeFileSync(`${path}.tmp`, content, 'utf8')
  renameSync(`${path}.tmp`, path)
}

export function createLicenseManager(options: LicenseManagerOptions): LicenseManager {
  const licensePath = join(options.dir, LICENSE_FILE)
  const statePath = join(options.dir, LICENSE_STATE_FILE)
  const now = options.now ?? ((): Date => new Date())
  let machineId: string | null | undefined

  const getMachineId = (): string | null => {
    if (machineId === undefined) machineId = options.readMachineId()
    return machineId
  }

  function readLastSeen(): Date | null {
    try {
      const { lastSeen } = JSON.parse(readText(statePath) ?? 'null') as { lastSeen?: unknown }
      const date = new Date(typeof lastSeen === 'string' ? lastSeen : NaN)
      return Number.isNaN(date.getTime()) ? null : date
    } catch {
      return null
    }
  }

  /** Moves the latest date seen forward, never back. */
  function recordDate(at: Date, lastSeen: Date | null): void {
    if (lastSeen && lastSeen.getTime() >= at.getTime()) return
    try {
      writeAtomic(statePath, JSON.stringify({ lastSeen: at.toISOString() }))
    } catch {
      // Not being able to write it must not lock the user out; the next check tries again.
    }
  }

  function verify(text: string, at: Date): VerifyResult {
    return verifyLicense(text, {
      publicKey: options.publicKey,
      machineId: getMachineId(),
      now: at,
      lastSeen: readLastSeen()
    })
  }

  function toStatus(result: VerifyResult | null, at: Date): LicenseStatus {
    const id = getMachineId()
    const license = result?.license ?? null
    let error: LicenseStatus['error'] = null
    if (!id) error = 'LICENSE_MACHINE_ID_UNAVAILABLE'
    else if (result && !result.ok) error = result.code
    return {
      active: id !== null && result?.ok === true,
      error,
      machineCode: id ? formatMachineCode(id) : null,
      customerName: license?.customerName ?? null,
      issuedAt: license?.issuedAt ?? null,
      expiresAt: license?.expiresAt ?? null,
      daysLeft: license?.expiresAt ? daysLeft(license.expiresAt, at) : null
    }
  }

  return {
    check() {
      const at = now()
      const text = readText(licensePath)
      const status = toStatus(text === null ? null : verify(text, at), at)
      recordDate(at, readLastSeen())
      return status
    },

    activate(text) {
      if (typeof text !== 'string') throw new ServiceError('LICENSE_INVALID')
      const at = now()
      if (!getMachineId()) throw new ServiceError('LICENSE_MACHINE_ID_UNAVAILABLE')
      const result = verify(text, at)
      if (!result.ok) throw new ServiceError(result.code)
      writeAtomic(licensePath, `${text.trim()}\n`)
      recordDate(at, readLastSeen())
      return toStatus(result, at)
    }
  }
}
