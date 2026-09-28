import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLog, LOG_FILE } from './log'

let dir: string
let folder: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'land-bl-log-'))
  folder = join(dir, 'logs')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const read = (name = LOG_FILE): string => readFileSync(join(folder, name), 'utf8')

describe('log file', () => {
  it('creates the folder and writes one timestamped line per entry', () => {
    const log = createLog({ folder, now: () => new Date(2026, 8, 28, 14, 3, 7, 120) })
    log.write('ERROR', 'export failed:', 'EXCEL_FAILED')
    log.write('INFO', 'started %s', '1.0.0')
    const lines = read().trimEnd().split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(
      /^2026-09-28 14:03:07\.120 [+-]\d\d:\d\d ERROR export failed: EXCEL_FAILED$/
    )
    expect(lines[1]).toMatch(/ INFO started 1\.0\.0$/)
  })

  it('writes the stack of an Error', () => {
    const log = createLog({ folder })
    log.write('ERROR', new Error('disk full'))
    expect(read()).toContain('Error: disk full')
    expect(read()).toContain('log.test.ts')
  })

  it('rotates at the size limit and keeps two old files', () => {
    const log = createLog({ folder, maxBytes: 1000 })
    for (let i = 0; i < 100; i++) log.write('ERROR', `entry ${i} `.padEnd(80, '.'))
    expect(readdirSync(folder).sort()).toEqual(['main.1.log', 'main.2.log', 'main.log'])
    for (const name of readdirSync(folder))
      expect(statSync(join(folder, name)).size).toBeLessThanOrEqual(1000)
    // The newest entries are in main.log, the ones just before in main.1.log.
    expect(read()).toContain('entry 99 ')
    expect(read('main.1.log')).not.toContain('entry 99 ')
    expect(read('main.2.log')).not.toContain('entry 0 ')
  })

  it('continues an existing file after a restart and rotates it', () => {
    createLog({ folder, maxBytes: 300 }).write('ERROR', 'x'.repeat(200))
    const next = createLog({ folder, maxBytes: 300 })
    next.write('ERROR', 'y'.repeat(200))
    expect(read()).toContain('yyy')
    expect(read('main.1.log')).toContain('xxx')
  })

  it('truncates a huge entry', () => {
    const log = createLog({ folder })
    log.write('ERROR', 'z'.repeat(100_000))
    expect(read().length).toBeLessThan(17_000)
    expect(read()).toContain('[truncated]')
  })

  it('never throws when the folder cannot be written', () => {
    const log = createLog({ folder: join(dir, 'file-not-folder', 'logs') })
    // A file where the parent folder should be.
    writeFileSync(join(dir, 'file-not-folder'), '')
    expect(() => log.write('ERROR', 'lost')).not.toThrow()
    expect(existsSync(join(dir, 'file-not-folder', 'logs'))).toBe(false)
  })
})
