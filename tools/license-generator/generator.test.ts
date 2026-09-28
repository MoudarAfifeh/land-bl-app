import { createPublicKey, generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { machineIdFromGuid, verifyLicense } from '../../src/main/license/codec.ts'
import { assertOutsideRepo, inspect, issue, keygen, LOG_FILE } from './generator.ts'

let repo: string
let keys: string
let publicKeyPath: string
let privateKeyPath: string

const MACHINE = machineIdFromGuid('91afce1f-3a34-4510-85bd-4cd8ff49892e')
const now = new Date(2026, 8, 28, 12)

function message(run: () => unknown): string {
  try {
    run()
  } catch (e) {
    return (e as Error).message
  }
  return 'no error'
}

beforeEach(() => {
  // A fake checkout (with .git) and a folder outside it for the private key.
  repo = mkdtempSync(join(tmpdir(), 'land-bl-repo-'))
  mkdirSync(join(repo, '.git'))
  mkdirSync(join(repo, 'src/main/license'), { recursive: true })
  publicKeyPath = join(repo, 'src/main/license/production-public-key.pem')
  keys = mkdtempSync(join(tmpdir(), 'land-bl-keys-'))
  privateKeyPath = join(keys, 'land-bl-private.pem')
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
  rmSync(keys, { recursive: true, force: true })
})

const gen = (force = false): ReturnType<typeof keygen> =>
  keygen({ privateKeyPath, publicKeyPath, repoRoot: repo, force })

const issueFor = (over: Partial<Parameters<typeof issue>[0]> = {}): ReturnType<typeof issue> =>
  issue({
    privateKeyPath,
    publicKeyPath,
    repoRoot: repo,
    machine: '  ' + MACHINE.toLowerCase().match(/.{4}/g)!.join('-') + ' ',
    customer: 'مكتب التخليص',
    expires: null,
    note: '',
    now,
    ...over
  })

describe('private key location', () => {
  it('refuses a key inside the repo, however the path is written', () => {
    const inside = [
      join(repo, 'key.pem'),
      join(repo, 'src', '..', 'secrets', 'key.pem'),
      join(repo.toUpperCase(), 'key.pem'),
      join(repo, 'new-folder', 'deeper', 'key.pem')
    ]
    for (const path of inside) {
      expect(
        message(() => assertOutsideRepo(path, repo)),
        path
      ).toMatch(/inside the repository/)
    }
  })

  it('refuses a key inside any git checkout (e.g. another clone)', () => {
    const clone = mkdtempSync(join(tmpdir(), 'land-bl-clone-'))
    mkdirSync(join(clone, '.git'))
    try {
      expect(message(() => assertOutsideRepo(join(clone, 'k.pem'), repo))).toMatch(/git/)
    } finally {
      rmSync(clone, { recursive: true, force: true })
    }
  })

  it('accepts a key outside', () => {
    expect(() => assertOutsideRepo(privateKeyPath, repo)).not.toThrow()
  })

  it('keygen and issue both refuse a key inside the repo', () => {
    privateKeyPath = join(repo, 'key.pem')
    expect(message(() => gen())).toMatch(/inside the repository/)
    expect(existsSync(privateKeyPath)).toBe(false)
    expect(message(() => issueFor())).toMatch(/inside the repository/)
  })
})

describe('keygen', () => {
  it('writes the private key outside and the public key into the app', () => {
    const { fingerprint } = gen()
    expect(fingerprint).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/)
    expect(readFileSync(privateKeyPath, 'utf8')).toContain('PRIVATE KEY')
    expect(readFileSync(publicKeyPath, 'utf8')).toContain('PUBLIC KEY')
  })

  it('never overwrites a private key', () => {
    writeFileSync(privateKeyPath, 'precious')
    expect(message(() => gen(true))).toMatch(/already exists/)
    expect(readFileSync(privateKeyPath, 'utf8')).toBe('precious')
  })

  it('replaces the app public key only with --force', () => {
    writeFileSync(publicKeyPath, 'old')
    expect(message(() => gen())).toMatch(/--force/)
    expect(existsSync(privateKeyPath)).toBe(false)
    gen(true)
    expect(readFileSync(publicKeyPath, 'utf8')).toContain('PUBLIC KEY')
  })
})

describe('issue', () => {
  beforeEach(() => gen())

  it('issues a license the app accepts on that machine only', () => {
    const { text, payload } = issueFor({ expires: '2027-09-30' })
    expect(payload).toEqual({
      v: 1,
      product: 'land-bl',
      machineId: MACHINE,
      customerName: 'مكتب التخليص',
      issuedAt: '2026-09-28',
      expiresAt: '2027-09-30'
    })
    const publicKey = createPublicKey(readFileSync(publicKeyPath))
    const ctx = { publicKey, now, lastSeen: null }
    expect(verifyLicense(text, { ...ctx, machineId: MACHINE }).ok).toBe(true)
    expect(verifyLicense(text, { ...ctx, machineId: '0000111122223333' }).ok).toBe(false)
  })

  it('logs every license next to the private key, CSV with a header', () => {
    issueFor({ customer: 'Office "A", Damascus', note: 'first install' })
    issueFor({ expires: '2027-01-31' })
    const log = readFileSync(join(keys, LOG_FILE), 'utf8')
    const lines = log.replace(/^﻿/, '').trimEnd().split(/\r?\n/)
    expect(lines).toEqual([
      'issued_at,customer_name,machine_code,expires_at,note',
      `2026-09-28,"Office ""A"", Damascus",${MACHINE.match(/.{4}/g)!.join('-')},never,first install`,
      `2026-09-28,مكتب التخليص,${MACHINE.match(/.{4}/g)!.join('-')},2027-01-31,`
    ])
    // A byte order mark, so Excel reads the Arabic names correctly.
    expect(log.startsWith('﻿')).toBe(true)
  })

  it('refuses a private key that does not match the app public key', () => {
    writeFileSync(
      publicKeyPath,
      generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' })
    )
    expect(message(() => issueFor())).toMatch(/does not match/)
    expect(existsSync(join(keys, LOG_FILE))).toBe(false)
  })

  it('checks the machine code, customer and expiry', () => {
    expect(message(() => issueFor({ machine: '7F3A-92C1' }))).toMatch(/machine code/i)
    expect(message(() => issueFor({ customer: '  ' }))).toMatch(/customer/i)
    expect(message(() => issueFor({ expires: '30/09/2027' }))).toMatch(/YYYY-MM-DD/)
    expect(message(() => issueFor({ expires: '2026-09-27' }))).toMatch(/past/)
    expect(existsSync(join(keys, LOG_FILE))).toBe(false)
  })

  it('inspect shows what a license contains and whether the app accepts its signature', () => {
    const { text } = issueFor({ expires: '2026-10-28' })
    const report = inspect(text, publicKeyPath, now)
    expect(report).toContain('Signature: valid')
    expect(report).toContain('مكتب التخليص')
    expect(report).toContain('2026-10-28 (30 days left)')
    const lines = text.split('\n')
    lines[1] = lines[1].slice(0, -1) + (lines[1].endsWith('A') ? 'B' : 'A')
    expect(inspect(lines.join('\n'), publicKeyPath, now)).toContain('Signature: INVALID')
  })
})
