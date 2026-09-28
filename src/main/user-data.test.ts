import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copyOldUserData, DATA_FOLDER, OLD_DATA_FOLDER } from './user-data'

let appData: string
let oldDir: string
let newDir: string

/** The pre-1.0 folder as a dev PC has it: the app's files next to Chromium's. */
function makeOldFolder(): void {
  mkdirSync(join(oldDir, 'Cache'), { recursive: true })
  writeFileSync(join(oldDir, 'Cache', 'data_0'), 'cache')
  writeFileSync(join(oldDir, 'Preferences'), '{}')
  writeFileSync(join(oldDir, 'land-bl.sqlite'), 'db')
  writeFileSync(join(oldDir, 'land-bl.sqlite-wal'), 'wal')
  writeFileSync(join(oldDir, 'backup.json'), '{"folder":"E:\\\\backups"}')
  writeFileSync(join(oldDir, 'license.lic'), 'license')
  writeFileSync(join(oldDir, 'license-state.json'), '{"lastSeen":"2026-09-28"}')
}

beforeEach(() => {
  appData = mkdtempSync(join(tmpdir(), 'land-bl-appdata-'))
  oldDir = join(appData, OLD_DATA_FOLDER)
  newDir = join(appData, DATA_FOLDER)
  mkdirSync(oldDir)
})

afterEach(() => rmSync(appData, { recursive: true, force: true }))

describe('copying the old data folder', () => {
  it("copies the app's files, not Chromium's, and leaves the old folder as it was", () => {
    makeOldFolder()
    const before = readdirSync(oldDir).sort()

    expect(copyOldUserData(appData)).toEqual({
      from: oldDir,
      to: newDir,
      files: [
        'land-bl.sqlite',
        'land-bl.sqlite-wal',
        'backup.json',
        'license.lic',
        'license-state.json'
      ]
    })
    expect(readdirSync(newDir).sort()).toEqual([
      'backup.json',
      'land-bl.sqlite',
      'land-bl.sqlite-wal',
      'license-state.json',
      'license.lic'
    ])
    expect(readFileSync(join(newDir, 'land-bl.sqlite'), 'utf8')).toBe('db')
    expect(readFileSync(join(newDir, 'license.lic'), 'utf8')).toBe('license')
    expect(readdirSync(oldDir).sort()).toEqual(before)
    expect(readFileSync(join(oldDir, 'land-bl.sqlite'), 'utf8')).toBe('db')
    // No temporary folder left behind.
    expect(readdirSync(appData).sort()).toEqual([DATA_FOLDER, OLD_DATA_FOLDER])
  })

  it('does nothing once the new folder exists, even if it is empty', () => {
    makeOldFolder()
    mkdirSync(newDir)
    expect(copyOldUserData(appData)).toBeNull()
    expect(readdirSync(newDir)).toEqual([])
  })

  it('never copies twice: later changes to the old folder stay there', () => {
    makeOldFolder()
    copyOldUserData(appData)
    writeFileSync(join(oldDir, 'land-bl.sqlite'), 'old app wrote again')
    expect(copyOldUserData(appData)).toBeNull()
    expect(readFileSync(join(newDir, 'land-bl.sqlite'), 'utf8')).toBe('db')
  })

  it('does nothing on a new install (no old folder)', () => {
    rmSync(oldDir, { recursive: true })
    expect(copyOldUserData(appData)).toBeNull()
    expect(existsSync(newDir)).toBe(false)
  })

  it('does nothing when the old folder has only Chromium files', () => {
    writeFileSync(join(oldDir, 'Preferences'), '{}')
    expect(copyOldUserData(appData)).toBeNull()
    expect(existsSync(newDir)).toBe(false)
  })

  it('leaves no new folder when the copy fails, so the next start tries again', () => {
    makeOldFolder()
    // A folder where a file is expected makes the copy fail half way.
    rmSync(join(oldDir, 'license.lic'))
    mkdirSync(join(oldDir, 'license.lic'))
    expect(() => copyOldUserData(appData)).toThrow()
    expect(readdirSync(appData)).toEqual([OLD_DATA_FOLDER])

    rmSync(join(oldDir, 'license.lic'), { recursive: true })
    writeFileSync(join(oldDir, 'license.lic'), 'license')
    expect(copyOldUserData(appData)?.files).toContain('license.lic')
    expect(readFileSync(join(newDir, 'license.lic'), 'utf8')).toBe('license')
  })
})
