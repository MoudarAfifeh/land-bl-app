/**
 * The license text: a JSON payload signed with Ed25519, tied to one machine, shown as a text block.
 * The app only verifies (public key); tools/license-generator signs with the private key.
 *
 * No Electron and no relative imports: the generator runs this same file with Node's type
 * stripping, so what it signs is exactly what the app checks.
 */
import { createHash, sign, verify, type KeyLike } from 'node:crypto'

export const LICENSE_PRODUCT = 'land-bl'
export const LICENSE_VERSION = 1

const BEGIN = '-----BEGIN LAND BL LICENSE-----'
const END = '-----END LAND BL LICENSE-----'
const LINE_LENGTH = 64

/** How far the clock may go back (time zone change, a slightly wrong clock) before it counts. */
export const MAX_CLOCK_ROLLBACK_MS = 2 * 24 * 60 * 60 * 1000

export interface LicensePayload {
  v: typeof LICENSE_VERSION
  product: typeof LICENSE_PRODUCT
  /** 16 uppercase hex characters, no dashes (see `machineIdFromGuid`). */
  machineId: string
  customerName: string
  /** YYYY-MM-DD. */
  issuedAt: string
  /** YYYY-MM-DD, valid through the end of that day (local time); null never expires. */
  expiresAt: string | null
}

/** The same strings as the app's error codes (shared/errors.ts). */
export type LicenseFailure =
  'LICENSE_INVALID' | 'LICENSE_WRONG_MACHINE' | 'LICENSE_CLOCK_ROLLBACK' | 'LICENSE_EXPIRED'

/** On failure, `license` is the signed payload when the signature was good (e.g. expired). */
export type VerifyResult =
  | { ok: true; license: LicensePayload }
  | { ok: false; code: LicenseFailure; license: LicensePayload | null }

export interface VerifyContext {
  publicKey: KeyLike
  /** This machine's ID; null when it couldn't be read (never matches). */
  machineId: string | null
  now: Date
  /** The latest date the app has seen, or null the first time. */
  lastSeen: Date | null
}

// ---- Machine code -------------------------------------------------------------------------------

const MACHINE_SALT = 'land-bl/machine/v1:'

/** The machine ID from the Windows MachineGuid: salted SHA-256, first 16 hex characters. */
export function machineIdFromGuid(guid: string): string {
  const digest = createHash('sha256')
    .update(MACHINE_SALT + guid.trim().toLowerCase())
    .digest('hex')
  return digest.slice(0, 16).toUpperCase()
}

/** 7F3A92C10B4ED8A5 → 7F3A-92C1-0B4E-D8A5. */
export function formatMachineCode(machineId: string): string {
  return machineId.match(/.{1,4}/g)!.join('-')
}

/** A machine code as typed or pasted (dashes, spaces, any case) → the ID, or null. */
export function parseMachineCode(text: string): string | null {
  const id = text.replace(/[\s-]/g, '').toUpperCase()
  return /^[0-9A-F]{16}$/.test(id) ? id : null
}

// ---- Dates --------------------------------------------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, '0')

/** The local calendar day of `now`, as YYYY-MM-DD. */
export function localDay(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** A real calendar date written YYYY-MM-DD. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** Whole days from today (local) to the expiry date: 0 on the last valid day, negative after. */
export function daysLeft(expiresAt: string, now: Date): number {
  return dayNumber(expiresAt) - dayNumber(localDay(now))
}

/** Local midnight at the start of an ISO day. */
function startOfDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// ---- Text block ---------------------------------------------------------------------------------

const BASE64URL = /^[A-Za-z0-9_-]+$/

/** Signs the payload and returns the text block to send to the client. */
export function encodeLicense(payload: LicensePayload, privateKey: KeyLike): string {
  const data = Buffer.from(JSON.stringify(payload), 'utf8')
  const signature = sign(null, data, privateKey)
  const body = `${data.toString('base64url')}.${signature.toString('base64url')}`
  const lines = body.match(new RegExp(`.{1,${LINE_LENGTH}}`, 'g'))!
  return [BEGIN, ...lines, END].join('\n')
}

/** The signed bytes and signature of a pasted block, or null if it isn't one. */
function decode(text: string): { data: Buffer; signature: Buffer } | null {
  let body = text
  const begin = body.indexOf(BEGIN)
  if (begin >= 0) body = body.slice(begin + BEGIN.length)
  const end = body.indexOf(END)
  if (end >= 0) body = body.slice(0, end)
  const parts = body.replace(/\s/g, '').split('.')
  if (parts.length !== 2 || !parts.every((p) => BASE64URL.test(p))) return null
  return {
    data: Buffer.from(parts[0], 'base64url'),
    signature: Buffer.from(parts[1], 'base64url')
  }
}

/** The payload if it has exactly the expected shape, otherwise null. */
function parsePayload(data: Buffer): LicensePayload | null {
  let value: unknown
  try {
    value = JSON.parse(data.toString('utf8'))
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const p = value as Record<string, unknown>
  const valid =
    p.v === LICENSE_VERSION &&
    p.product === LICENSE_PRODUCT &&
    typeof p.machineId === 'string' &&
    /^[0-9A-F]{16}$/.test(p.machineId) &&
    typeof p.customerName === 'string' &&
    p.customerName.trim().length > 0 &&
    isIsoDate(p.issuedAt) &&
    (p.expiresAt === null || isIsoDate(p.expiresAt))
  if (!valid) return null
  return {
    v: LICENSE_VERSION,
    product: LICENSE_PRODUCT,
    machineId: p.machineId as string,
    customerName: p.customerName as string,
    issuedAt: p.issuedAt as string,
    expiresAt: p.expiresAt as string | null
  }
}

/**
 * Checks, in order: signature and shape, machine, clock rollback, expiry. The rollback comes
 * before the expiry so setting the clock back never makes an expired license look valid.
 */
export function verifyLicense(text: string, ctx: VerifyContext): VerifyResult {
  const decoded = decode(text)
  let signed = false
  if (decoded) {
    try {
      signed = verify(null, decoded.data, ctx.publicKey, decoded.signature)
    } catch {
      signed = false
    }
  }
  const license = decoded && signed ? parsePayload(decoded.data) : null
  if (!license) return { ok: false, code: 'LICENSE_INVALID', license: null }

  if (license.machineId !== ctx.machineId)
    return { ok: false, code: 'LICENSE_WRONG_MACHINE', license }

  const now = ctx.now.getTime()
  const floor = Math.max(ctx.lastSeen?.getTime() ?? 0, startOfDay(license.issuedAt).getTime())
  if (now < floor - MAX_CLOCK_ROLLBACK_MS)
    return { ok: false, code: 'LICENSE_CLOCK_ROLLBACK', license }

  if (license.expiresAt !== null && localDay(ctx.now) > license.expiresAt)
    return { ok: false, code: 'LICENSE_EXPIRED', license }

  return { ok: true, license }
}
