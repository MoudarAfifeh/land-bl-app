/**
 * The license generator's work: key pair, issuing, inspecting, the log of issued licenses. For the
 * developer only: never imported by the app, never packaged (electron-builder.yml).
 *
 * Runs with Node's type stripping (`npm run license`), so imports carry their `.ts` extension and
 * the only app code used is codec.ts, which has no imports of its own.
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject
} from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import {
  daysLeft,
  encodeLicense,
  formatMachineCode,
  isIsoDate,
  localDay,
  parseMachineCode,
  verifyLicense,
  LICENSE_PRODUCT,
  LICENSE_VERSION,
  type LicensePayload
} from '../../src/main/license/codec.ts'

/** Where keygen writes the public key the app is built with (electron.vite.config.ts). */
export const PUBLIC_KEY_PATH = 'src/main/license/production-public-key.pem'
/** Next to the private key: one row per license issued. */
export const LOG_FILE = 'issued-licenses.csv'
const LOG_HEADER = 'issued_at,customer_name,machine_code,expires_at,note'

// ---- Where the private key may live ---------------------------------------------------------------

/**
 * The real absolute path, following links and junctions, even when the file (or some of its
 * folders) doesn't exist yet: the nearest existing folder is resolved and the rest appended.
 */
function realPath(path: string): string {
  const missing: string[] = []
  let current = resolve(path)
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) break
    missing.unshift(basename(current))
    current = parent
  }
  const real = existsSync(current) ? realpathSync.native(current) : current
  return join(real, ...missing)
}

/** `path` is `folder` or somewhere below it (case-insensitive on Windows). */
function isInside(path: string, folder: string): boolean {
  const fold = (p: string): string => (process.platform === 'win32' ? p.toLowerCase() : p)
  const rel = relative(fold(folder), fold(path))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** The nearest folder above `path` that holds a `.git`, or null. */
function gitCheckoutOf(path: string): string | null {
  let current = dirname(path)
  for (;;) {
    if (existsSync(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

/**
 * The private key (and the log next to it) must never be in this repository, or in any git
 * checkout, where a commit could publish it. Throws otherwise; returns the resolved path.
 */
export function assertOutsideRepo(path: string, repoRoot: string): string {
  const real = realPath(path)
  const repo = realPath(repoRoot)
  if (isInside(real, repo)) {
    throw new Error(
      `The private key path ${real} is inside the repository (${repo}). Keep the key outside it, ` +
        'e.g. on a USB drive or in a folder of its own (see docs/LICENSING.md).'
    )
  }
  const checkout = gitCheckoutOf(real)
  if (checkout) {
    throw new Error(
      `The private key path ${real} is inside a git checkout (${checkout}). Keep the key outside ` +
        'any repository.'
    )
  }
  return real
}

// ---- Keys --------------------------------------------------------------------------------------

/** SHA-256 of the public key (SPKI DER), first 16 hex, to check which key a build carries. */
export function fingerprint(publicKey: KeyObject): string {
  const der = publicKey.export({ type: 'spki', format: 'der' })
  return formatMachineCode(
    createHash('sha256').update(der).digest('hex').slice(0, 16).toUpperCase()
  )
}

export interface KeygenOptions {
  privateKeyPath: string
  /** The app's public key file (PUBLIC_KEY_PATH in the repo). */
  publicKeyPath: string
  repoRoot: string
  /** Replace an existing app public key: every license issued with the old key stops working. */
  force: boolean
}

/** Creates the key pair once: private key outside the repo, public key into the app. */
export function keygen(options: KeygenOptions): { privateKeyPath: string; fingerprint: string } {
  const privateKeyPath = assertOutsideRepo(options.privateKeyPath, options.repoRoot)
  if (existsSync(privateKeyPath)) {
    throw new Error(`${privateKeyPath} already exists. A private key is never overwritten.`)
  }
  if (existsSync(options.publicKeyPath) && !options.force) {
    throw new Error(
      `The app already has a public key (${options.publicKeyPath}). Replacing it makes every ` +
        'license issued so far invalid after the next update. Run again with --force to do it anyway.'
    )
  }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  // wx: fail rather than overwrite, even if the file appeared in the meantime.
  writeFileSync(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
    flag: 'wx',
    mode: 0o600
  })
  writeFileSync(options.publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }))
  return { privateKeyPath, fingerprint: fingerprint(publicKey) }
}

// ---- Issuing -----------------------------------------------------------------------------------

export interface IssueOptions {
  privateKeyPath: string
  publicKeyPath: string
  repoRoot: string
  /** As the client sent it: dashes, spaces and case don't matter. */
  machine: string
  customer: string
  /** YYYY-MM-DD, valid through that day; null never expires. */
  expires: string | null
  note: string
  now: Date
}

const csvCell = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

/** One row per license; the file starts with a BOM so Excel reads Arabic names correctly. */
function appendLog(logPath: string, payload: LicensePayload, note: string): void {
  if (!existsSync(logPath)) writeFileSync(logPath, `﻿${LOG_HEADER}\r\n`, 'utf8')
  const row = [
    payload.issuedAt,
    payload.customerName,
    formatMachineCode(payload.machineId),
    payload.expiresAt ?? 'never',
    note
  ]
  appendFileSync(logPath, `${row.map(csvCell).join(',')}\r\n`, 'utf8')
}

/** Signs a license for one machine, checks the app will accept it, and logs it. */
export function issue(options: IssueOptions): {
  text: string
  payload: LicensePayload
  logPath: string
} {
  const privateKeyPath = assertOutsideRepo(options.privateKeyPath, options.repoRoot)

  const machineId = parseMachineCode(options.machine)
  if (!machineId) {
    throw new Error(
      `"${options.machine}" is not a machine code: 16 characters 0-9 / A-F, e.g. 7F3A-92C1-0B4E-D8A5.`
    )
  }
  const customerName = options.customer.trim()
  if (!customerName) throw new Error('The customer name is empty.')
  const today = localDay(options.now)
  if (options.expires !== null) {
    if (!isIsoDate(options.expires)) {
      throw new Error(`Expiry "${options.expires}" must be a date written YYYY-MM-DD.`)
    }
    if (options.expires < today) throw new Error(`Expiry ${options.expires} is in the past.`)
  }

  if (!existsSync(privateKeyPath)) throw new Error(`Private key not found: ${privateKeyPath}`)
  if (!existsSync(options.publicKeyPath)) {
    throw new Error(`The app has no public key yet (${options.publicKeyPath}): run keygen first.`)
  }
  const privateKey = createPrivateKey(readFileSync(privateKeyPath))
  const appKey = createPublicKey(readFileSync(options.publicKeyPath))
  if (fingerprint(createPublicKey(privateKey)) !== fingerprint(appKey)) {
    throw new Error(
      `This private key does not match the app's public key (${options.publicKeyPath}): the app ` +
        'would refuse the license.'
    )
  }

  const payload: LicensePayload = {
    v: LICENSE_VERSION,
    product: LICENSE_PRODUCT,
    machineId,
    customerName,
    issuedAt: today,
    expiresAt: options.expires
  }
  const text = encodeLicense(payload, privateKey)
  const check = verifyLicense(text, {
    publicKey: appKey,
    machineId,
    now: options.now,
    lastSeen: null
  })
  if (!check.ok) throw new Error(`The new license fails the app's own check (${check.code}).`)

  const logPath = join(dirname(privateKeyPath), LOG_FILE)
  appendLog(logPath, payload, options.note.trim())
  return { text, payload, logPath }
}

// ---- Inspecting --------------------------------------------------------------------------------

/** What a license says, and whether its signature is valid for the app's public key. */
export function inspect(text: string, publicKeyPath: string, now: Date): string {
  const publicKey = createPublicKey(readFileSync(publicKeyPath))
  // No machine given: a good signature comes back as "wrong machine", with the payload.
  const result = verifyLicense(text, { publicKey, machineId: null, now, lastSeen: null })
  if (result.ok || !result.license) return 'Signature: INVALID (not a license from this key)'
  const p = result.license
  const expiry = p.expiresAt ? `${p.expiresAt} (${daysLeft(p.expiresAt, now)} days left)` : 'never'
  return [
    'Signature: valid',
    `Customer:  ${p.customerName}`,
    `Machine:   ${formatMachineCode(p.machineId)}`,
    `Issued:    ${p.issuedAt}`,
    `Expires:   ${expiry}`
  ].join('\n')
}
