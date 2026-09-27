import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ServiceError } from '@shared/errors'
import { openDb, type Db } from '../db/client'
import { documents } from '../db/schema'
import { MIGRATIONS } from '../db/test-db'
import {
  BACKUP_KEEP,
  backupAge,
  backupFileName,
  backupStatus,
  isBackupDue,
  listBackups,
  readBackupConfig,
  recordBackup,
  rotateBackups,
  writeBackup
} from './backup'
import { createDocument } from './documents'
import { sampleDocument } from './test-fixtures'
import { createVessel } from './vessels'

let dir: string
let db: Db

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'land-bl-backup-'))
  db = openDb(join(dir, 'app.sqlite'), MIGRATIONS)
  const vessel = createVessel(db, { name: 'MT A', prefix: 'A', arrivalDate: null, isActive: true })
  createDocument(db, sampleDocument(vessel.id))
  createDocument(db, sampleDocument(vessel.id, { driverName: 'سائق ثان' }))
})

afterEach(() => {
  db.$client.close()
  rmSync(dir, { recursive: true, force: true })
})

const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date =>
  new Date(y, mo - 1, d, h, mi, s)

async function codeOf(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run()
  } catch (e) {
    return e instanceof ServiceError ? e.code : String(e)
  }
  return undefined
}

describe('file names', () => {
  it('carry the local date and time, sortable', () => {
    expect(backupFileName(at(2026, 9, 7, 8, 5, 3))).toBe('land-bl_2026-09-07_08-05-03.sqlite')
    expect(backupFileName(at(2026, 9, 7, 8, 5, 3), 'before-restore')).toBe(
      'land-bl_before-restore_2026-09-07_08-05-03.sqlite'
    )
  })
})

describe('schedule', () => {
  const now = at(2026, 9, 27, 12)
  const hoursAgo = (h: number): string => new Date(now.getTime() - h * 3_600_000).toISOString()

  it('is due with no backup yet, or after 24 hours', () => {
    expect(isBackupDue(null, now)).toBe(true)
    expect(isBackupDue(hoursAgo(23), now)).toBe(false)
    expect(isBackupDue(hoursAgo(24), now)).toBe(true)
  })

  it('warns when there is none or the last is older than 7 days', () => {
    expect(backupAge(null, now)).toBe('none')
    expect(backupAge(hoursAgo(7 * 24 - 1), now)).toBe('ok')
    expect(backupAge(hoursAgo(7 * 24 + 1), now)).toBe('stale')
  })
})

describe('writeBackup', () => {
  it('writes a copy through the backup API that opens with the same rows', async () => {
    const folder = join(dir, 'backups', 'nested')
    const path = await writeBackup(db, folder, at(2026, 9, 27, 10))
    expect(path).toBe(join(folder, 'land-bl_2026-09-27_10-00-00.sqlite'))
    expect(readdirSync(folder)).toEqual(['land-bl_2026-09-27_10-00-00.sqlite'])

    const copy = openDb(path, MIGRATIONS)
    expect(copy.select().from(documents).all()).toEqual(db.select().from(documents).all())
    copy.$client.close()
  })

  it('never overwrites a backup taken in the same second', async () => {
    const now = at(2026, 9, 27, 10)
    const first = await writeBackup(db, dir, now)
    const second = await writeBackup(db, dir, now)
    expect(second).not.toBe(first)
    expect(listBackups(dir)).toEqual([second, first])
  })

  it('reports a folder that is not available (e.g. drive unplugged)', async () => {
    const notAFolder = join(dir, 'file.txt')
    writeFileSync(notAFolder, 'x')
    expect(await codeOf(() => writeBackup(db, join(notAFolder, 'sub'), new Date()))).toBe(
      'BACKUP_FOLDER_UNAVAILABLE'
    )
  })
})

describe('rotation', () => {
  it(`keeps the newest ${BACKUP_KEEP} backups and never touches other files`, async () => {
    const folder = join(dir, 'rot')
    for (let day = 1; day <= BACKUP_KEEP; day++) await writeBackup(db, folder, at(2026, 8, day))
    writeFileSync(join(folder, 'notes.txt'), 'keep me')
    writeFileSync(join(folder, 'land-bl.sqlite'), 'not ours')
    await writeBackup(db, folder, at(2026, 7, 1), 'before-restore')

    // The 31st backup removes the oldest one (1 August).
    const newest = await writeBackup(db, folder, at(2026, 9, 27))
    const kept = listBackups(folder)
    expect(kept).toHaveLength(BACKUP_KEEP)
    expect(kept[0]).toBe(newest)
    expect(existsSync(join(folder, 'land-bl_2026-08-01_00-00-00.sqlite'))).toBe(false)
    expect(existsSync(join(folder, 'land-bl_2026-08-02_00-00-00.sqlite'))).toBe(true)
    for (const other of [
      'notes.txt',
      'land-bl.sqlite',
      'land-bl_before-restore_2026-07-01_00-00-00.sqlite'
    ])
      expect(existsSync(join(folder, other)), other).toBe(true)
  })

  it('orders same-second backups after the first one', () => {
    const names = [
      'land-bl_2026-09-27_10-00-00.sqlite',
      'land-bl_2026-09-27_10-00-00-1.sqlite',
      'land-bl_2026-09-27_10-00-00-2.sqlite',
      'land-bl_2026-09-26_10-00-00.sqlite'
    ]
    for (const n of names) writeFileSync(join(dir, n), '')
    expect(rotateBackups(dir, 2).map((p) => p.slice(dir.length + 1))).toEqual([
      'land-bl_2026-09-27_10-00-00.sqlite',
      'land-bl_2026-09-26_10-00-00.sqlite'
    ])
    expect(listBackups(dir).map((p) => p.slice(dir.length + 1))).toEqual([
      'land-bl_2026-09-27_10-00-00-2.sqlite',
      'land-bl_2026-09-27_10-00-00-1.sqlite'
    ])
  })
})

describe('recording backups', () => {
  it('stores the last success, and keeps it while recording a failure', async () => {
    const config = join(dir, 'backup.json')
    const folder = join(dir, 'out')
    const ok = await recordBackup(db, config, folder, at(2026, 9, 27, 9))
    expect(ok.lastBackupPath).toBe(join(folder, 'land-bl_2026-09-27_09-00-00.sqlite'))
    expect(ok.lastError).toBeNull()

    const blocked = join(dir, 'blocked')
    writeFileSync(blocked, '')
    await expect(recordBackup(db, config, join(blocked, 'x'), at(2026, 9, 28, 9))).rejects.toThrow(
      'BACKUP_FOLDER_UNAVAILABLE'
    )
    const after = readBackupConfig(config)
    expect(after.lastBackupAt).toBe(ok.lastBackupAt)
    expect(after.lastError?.code).toBe('BACKUP_FOLDER_UNAVAILABLE')
  })

  it('reads a missing or damaged config as "never backed up"', () => {
    expect(readBackupConfig(join(dir, 'missing.json'))).toEqual({
      folder: null,
      lastBackupAt: null,
      lastBackupPath: null,
      lastError: null
    })
    writeFileSync(join(dir, 'bad.json'), '{ not json')
    expect(readBackupConfig(join(dir, 'bad.json')).lastBackupAt).toBeNull()
  })

  it('reports the status with the default folder until one is chosen', () => {
    const status = backupStatus(
      join(dir, 'none.json'),
      'D:\\LandBL-Backups',
      'C:\\data',
      at(2026, 9, 27)
    )
    expect(status).toEqual({
      folder: 'D:\\LandBL-Backups',
      lastBackupAt: null,
      lastBackupPath: null,
      lastError: null,
      age: 'none',
      sameDriveAsData: false
    })
    expect(
      backupStatus(join(dir, 'none.json'), 'c:\\Users\\x\\Backups', 'C:\\data', new Date())
        .sameDriveAsData
    ).toBe(true)
  })
})
