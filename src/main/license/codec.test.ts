import { createHash, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  daysLeft,
  encodeLicense,
  formatMachineCode,
  machineIdFromGuid,
  parseMachineCode,
  verifyLicense,
  type LicensePayload
} from './codec'

const keys = generateKeyPairSync('ed25519')
const otherKeys = generateKeyPairSync('ed25519')

const MACHINE = '7F3A92C10B4ED8A5'

const payload = (over: Partial<LicensePayload> = {}): LicensePayload => ({
  v: 1,
  product: 'land-bl',
  machineId: MACHINE,
  customerName: 'مكتب التخليص',
  issuedAt: '2026-09-01',
  expiresAt: null,
  ...over
})

/** Local noon, so the day doesn't depend on the test machine's time zone. */
const day = (iso: string, hour = 12): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, hour)
}

const check = (
  text: string,
  over: { machineId?: string; now?: Date; lastSeen?: Date | null } = {}
): ReturnType<typeof verifyLicense> =>
  verifyLicense(text, {
    publicKey: keys.publicKey,
    machineId: over.machineId ?? MACHINE,
    now: over.now ?? day('2026-09-28'),
    lastSeen: over.lastSeen ?? null
  })

/** The base64url body between the markers, and the parts around it. */
function split(text: string): { body: string; rebuild: (body: string) => string } {
  const lines = text.split('\n')
  return {
    body: lines.slice(1, -1).join(''),
    rebuild: (body) => [lines[0], body, lines[lines.length - 1]].join('\n')
  }
}

describe('license codec', () => {
  it('accepts a valid license and returns its payload', () => {
    const result = check(encodeLicense(payload(), keys.privateKey))
    expect(result).toEqual({ ok: true, license: payload() })
  })

  it('is a text block with markers and short lines', () => {
    const text = encodeLicense(payload(), keys.privateKey)
    const lines = text.split('\n')
    expect(lines[0]).toBe('-----BEGIN LAND BL LICENSE-----')
    expect(lines[lines.length - 1]).toBe('-----END LAND BL LICENSE-----')
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(64)
  })

  it('ignores whitespace, line breaks and text around the block when pasted', () => {
    const text = encodeLicense(payload(), keys.privateKey)
    const pasted = `Hello,\r\nhere is your license:\r\n\r\n  ${text.split('\n').join('\r\n   ')}  \r\nThanks`
    expect(check(pasted).ok).toBe(true)
    // Without the markers, the body alone is enough.
    expect(check(split(text).body).ok).toBe(true)
  })

  it('refuses a license for another machine', () => {
    const result = check(encodeLicense(payload(), keys.privateKey), {
      machineId: '0000111122223333'
    })
    expect(result).toMatchObject({ ok: false, code: 'LICENSE_WRONG_MACHINE' })
  })

  it('refuses a tampered payload (signature kept)', () => {
    const text = encodeLicense(payload({ customerName: 'Office A' }), keys.privateKey)
    const { body, rebuild } = split(text)
    const [data, signature] = body.split('.')
    const json = Buffer.from(data, 'base64url').toString('utf8').replace('Office A', 'Office B')
    const forged = rebuild(`${Buffer.from(json).toString('base64url')}.${signature}`)
    expect(check(forged)).toEqual({ ok: false, code: 'LICENSE_INVALID', license: null })
  })

  it('refuses an extended expiry (signature kept)', () => {
    const text = encodeLicense(payload({ expiresAt: '2026-10-01' }), keys.privateKey)
    const { body, rebuild } = split(text)
    const [data, signature] = body.split('.')
    const json = Buffer.from(data, 'base64url')
      .toString('utf8')
      .replace('"expiresAt":"2026-10-01"', '"expiresAt":null')
    const forged = rebuild(`${Buffer.from(json).toString('base64url')}.${signature}`)
    expect(check(forged)).toMatchObject({ ok: false, code: 'LICENSE_INVALID' })
  })

  it('refuses a tampered signature', () => {
    const { body, rebuild } = split(encodeLicense(payload(), keys.privateKey))
    const [data, signature] = body.split('.')
    const bytes = Buffer.from(signature, 'base64url')
    bytes[10] ^= 0x01
    expect(check(rebuild(`${data}.${bytes.toString('base64url')}`))).toMatchObject({
      ok: false,
      code: 'LICENSE_INVALID'
    })
    // A truncated signature too.
    expect(check(rebuild(`${data}.${signature.slice(0, 20)}`)).ok).toBe(false)
  })

  it('refuses a license signed by another key', () => {
    const result = check(encodeLicense(payload(), otherKeys.privateKey))
    expect(result).toMatchObject({ ok: false, code: 'LICENSE_INVALID' })
  })

  it('refuses malformed text', () => {
    for (const text of ['', 'hello', 'a.b.c', '-----BEGIN LAND BL LICENSE-----\n!!\n']) {
      expect(check(text), text).toMatchObject({ ok: false, code: 'LICENSE_INVALID' })
    }
  })

  it('refuses a signed payload of another product, version or shape', () => {
    const bad = [
      { ...payload(), product: 'other' },
      { ...payload(), v: 2 },
      { ...payload(), customerName: '' },
      { ...payload(), machineId: '7f3a-92c1' },
      { ...payload(), issuedAt: '2026-02-30' },
      { ...payload(), expiresAt: 'soon' }
    ]
    for (const p of bad) {
      const result = check(encodeLicense(p as LicensePayload, keys.privateKey))
      expect(result, JSON.stringify(p)).toMatchObject({ ok: false, code: 'LICENSE_INVALID' })
    }
  })

  it('is valid through the expiry day, expired the day after', () => {
    const text = encodeLicense(payload({ expiresAt: '2026-09-28' }), keys.privateKey)
    expect(check(text, { now: day('2026-09-28', 23) }).ok).toBe(true)
    expect(check(text, { now: day('2026-09-29', 0) })).toMatchObject({
      ok: false,
      code: 'LICENSE_EXPIRED',
      license: { expiresAt: '2026-09-28' }
    })
  })

  it('detects a clock set back more than 2 days from the latest date seen', () => {
    const text = encodeLicense(payload(), keys.privateKey)
    const lastSeen = day('2026-09-28')
    expect(check(text, { now: day('2026-09-25'), lastSeen })).toMatchObject({
      ok: false,
      code: 'LICENSE_CLOCK_ROLLBACK'
    })
    // Up to 2 days back is tolerated (time zone or a slightly wrong clock).
    expect(check(text, { now: day('2026-09-26'), lastSeen }).ok).toBe(true)
    // Once the clock is fixed, the license is valid again.
    expect(check(text, { now: day('2026-09-28'), lastSeen }).ok).toBe(true)
  })

  it('checks the rollback before the expiry, so an expired license cannot be revived', () => {
    const text = encodeLicense(payload({ expiresAt: '2026-09-20' }), keys.privateKey)
    expect(check(text, { now: day('2026-09-19'), lastSeen: day('2026-09-28') })).toMatchObject({
      ok: false,
      code: 'LICENSE_CLOCK_ROLLBACK'
    })
  })

  it('treats a clock more than 2 days before the issue date as rolled back', () => {
    const text = encodeLicense(payload({ issuedAt: '2026-09-10' }), keys.privateKey)
    expect(check(text, { now: day('2026-09-07') })).toMatchObject({
      ok: false,
      code: 'LICENSE_CLOCK_ROLLBACK'
    })
    expect(check(text, { now: day('2026-09-08') }).ok).toBe(true)
  })
})

describe('machine code', () => {
  it('is a stable 16 hex digest of the MachineGuid, case and spaces ignored', () => {
    const id = machineIdFromGuid('91afce1f-3a34-4510-85bd-4cd8ff49892e')
    expect(id).toMatch(/^[0-9A-F]{16}$/)
    expect(machineIdFromGuid(' 91AFCE1F-3A34-4510-85BD-4CD8FF49892E\n')).toBe(id)
    expect(machineIdFromGuid('91afce1f-3a34-4510-85bd-4cd8ff49892f')).not.toBe(id)
    // Salted: not the plain hash of the GUID.
    const plain = createHash('sha256').update('91afce1f-3a34-4510-85bd-4cd8ff49892e').digest('hex')
    expect(id).not.toBe(plain.slice(0, 16).toUpperCase())
  })

  it('is shown in groups of 4 and read back however it was typed', () => {
    expect(formatMachineCode(MACHINE)).toBe('7F3A-92C1-0B4E-D8A5')
    expect(parseMachineCode('7F3A-92C1-0B4E-D8A5')).toBe(MACHINE)
    expect(parseMachineCode(' 7f3a 92c1 0b4e d8a5 ')).toBe(MACHINE)
    expect(parseMachineCode('7F3A-92C1-0B4E')).toBeNull()
    expect(parseMachineCode('7F3A-92C1-0B4E-D8AZ')).toBeNull()
  })
})

describe('days left', () => {
  it('counts whole days to the expiry date, 0 on the day itself', () => {
    expect(daysLeft('2026-10-28', day('2026-09-28'))).toBe(30)
    expect(daysLeft('2026-09-28', day('2026-09-28', 23))).toBe(0)
    expect(daysLeft('2026-09-27', day('2026-09-28'))).toBe(-1)
  })
})
