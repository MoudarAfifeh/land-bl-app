import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ServiceError } from '@shared/errors'
import { openDb, type Db } from '../db/client'
import { documents } from '../db/schema'
import { MIGRATIONS, migrationsUpTo } from '../db/test-db'
import { LICENSE_FILE, LICENSE_STATE_FILE } from '../license/manager'
import { writeBackup } from './backup'
import { createDocument, getDocumentView, softDeleteDocument } from './documents'
import { prepareRestore, replaceDatabase, restoreDatabase } from './restore'
import { sampleDocument } from './test-fixtures'
import { createVessel } from './vessels'

let dir: string
let dbPath: string
let current: Db
let vesselA: number

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'land-bl-restore-'))
  dbPath = join(dir, 'land-bl.sqlite')
  current = openDb(dbPath, MIGRATIONS)
  vesselA = createVessel(
    current,
    { name: 'MT Alpha', prefix: 'A', arrivalDate: null, isActive: true },
    { makeActive: true }
  ).id
})

afterEach(() => {
  if (current.$client.open) current.$client.close()
  rmSync(dir, { recursive: true, force: true })
})

const add = (db: Db, vesselId: number): { id: number; serialNo: string } =>
  createDocument(db, sampleDocument(vesselId))

async function backup(): Promise<string> {
  return writeBackup(current, join(dir, 'backups'), new Date())
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run()
  } catch (e) {
    return e instanceof ServiceError ? e.code : String(e)
  }
  return undefined
}

const prepare = (file: string): ReturnType<typeof prepareRestore> =>
  prepareRestore(file, current, MIGRATIONS, dir)

/** A backup that is fine, to damage in the tests below. */
async function sizableBackup(): Promise<string> {
  for (let i = 0; i < 300; i++) add(current, vesselA)
  return backup()
}

describe('checking the file', () => {
  it('refuses a file that is not a database', () => {
    const text = join(dir, 'notes.txt')
    writeFileSync(text, 'hello, this is not SQLite '.repeat(200))
    expect(codeOf(() => prepare(text))).toBe('BACKUP_NOT_DATABASE')
    expect(codeOf(() => prepare(resolve('templates/land-bl.xlsx')))).toBe('BACKUP_NOT_DATABASE')
  })

  it('refuses a database that is not this app’s', () => {
    const other = join(dir, 'other.sqlite')
    const db = new Database(other)
    db.exec('CREATE TABLE things (id INTEGER PRIMARY KEY, name TEXT)')
    db.close()
    expect(codeOf(() => prepare(other))).toBe('BACKUP_NOT_APP')

    const empty = join(dir, 'empty.sqlite')
    writeFileSync(empty, '')
    expect(codeOf(() => prepare(empty))).toBe('BACKUP_NOT_APP')
  })

  it('refuses a corrupted backup: damaged pages', async () => {
    const file = await sizableBackup()
    const fd = openSync(file, 'r+')
    const page = 4096
    writeSync(fd, Buffer.alloc(page * 3, 0xa5), 0, page * 3, page * 2)
    closeSync(fd)
    expect(codeOf(() => prepare(file))).toBe('BACKUP_CORRUPTED')
  })

  it('refuses a corrupted backup: cut short', async () => {
    const file = await sizableBackup()
    truncateSync(file, Math.floor(statSync(file).size / 2))
    expect(codeOf(() => prepare(file))).toBe('BACKUP_CORRUPTED')
  })

  it('refuses a backup from a newer app version', async () => {
    const file = await backup()
    const db = new Database(file)
    db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(
      'future',
      Date.now() + 10 * 365 * 24 * 3_600_000
    )
    db.close()
    expect(codeOf(() => prepare(file))).toBe('BACKUP_TOO_NEW')
  })

  it('accepts a backup from an older schema and migrates it', () => {
    const file = join(dir, 'old.sqlite')
    const old = openDb(file, migrationsUpTo('0001_history_search'))
    old.$client.exec(`
      INSERT INTO vessels (name, prefix) VALUES ('MT Old', 'A');
      INSERT INTO counters (vessel_id, last_number) VALUES (1, 1);
      INSERT INTO documents (vessel_id, number, serial_no, issue_date, shipper_name,
        consignee_name, tanker_no, driver_name) VALUES (1, 1, 'A00001', '2026-09-01', 's', 'c', 't', 'd');
    `)
    old.$client.close()

    const prepared = prepare(file)
    expect(prepared.preview).toMatchObject({ documentCount: 1, newestSerial: 'A00001' })
    prepared.dispose()
  })

  it('never changes the chosen file', async () => {
    const file = await backup()
    const before = statSync(file).mtimeMs
    prepare(file).dispose()
    expect(statSync(file).mtimeMs).toBe(before)
    expect(readdirSync(join(dir, 'backups'))).toHaveLength(1)
  })
})

describe('preview', () => {
  it('shows the document count and the newest serial', async () => {
    const first = add(current, vesselA)
    add(current, vesselA)
    softDeleteDocument(current, first.id)
    const prepared = prepare(await backup())
    expect(prepared.preview).toMatchObject({
      documentCount: 2,
      deletedCount: 1,
      newestSerial: 'A00002',
      removedDocuments: 0,
      lostVessels: [],
      vessels: [{ name: 'MT Alpha', prefix: 'A', nextSerial: 'A00003', keptHigher: false }]
    })
    prepared.dispose()
  })
})

describe('counter rule', () => {
  it('keeps the higher counter per vessel, so printed serials are never issued again', async () => {
    add(current, vesselA)
    add(current, vesselA)
    const file = await backup()
    add(current, vesselA) // A00003 and A00004 exist only after the backup
    add(current, vesselA)

    const prepared = prepare(file)
    expect(prepared.preview.removedDocuments).toBe(2)
    expect(prepared.preview.vessels).toEqual([
      { name: 'MT Alpha', prefix: 'A', nextSerial: 'A00005', keptHigher: true }
    ])
    prepared.dispose()

    await restoreDatabase({
      current,
      closeCurrent: () => current.$client.close(),
      dbPath,
      file,
      migrationsFolder: MIGRATIONS,
      workDir: dir,
      safetyFolder: join(dir, 'safety'),
      now: new Date()
    })
    const restored = openDb(dbPath, MIGRATIONS)
    expect(restored.select().from(documents).all()).toHaveLength(2)
    expect(add(restored, vesselA).serialNo).toBe('A00005')
    restored.$client.close()
  })

  it('does not carry a counter over when the vessel’s letter differs', async () => {
    const file = await backup()
    current.$client.exec(`UPDATE vessels SET prefix = 'Z' WHERE id = ${vesselA}`)
    add(current, vesselA)
    const prepared = prepare(file)
    expect(prepared.preview.vessels[0]).toMatchObject({ nextSerial: 'A00001', keptHigher: false })
    expect(prepared.preview.lostVessels).toEqual([
      { name: 'MT Alpha', prefix: 'Z', lastSerial: 'Z00001' }
    ])
    prepared.dispose()
  })

  it('lists vessels created after the backup with their last issued serial', async () => {
    const file = await backup()
    const b = createVessel(current, {
      name: 'MT Beta',
      prefix: 'B',
      arrivalDate: null,
      isActive: true
    })
    add(current, b.id)
    add(current, b.id)
    createVessel(current, { name: 'MT Gamma', prefix: 'G', arrivalDate: null, isActive: false })

    const prepared = prepare(file)
    expect(prepared.preview.lostVessels).toEqual([
      { name: 'MT Beta', prefix: 'B', lastSerial: 'B00002' },
      { name: 'MT Gamma', prefix: 'G', lastSerial: null }
    ])
    expect(prepared.preview.removedDocuments).toBe(2)
    prepared.dispose()
  })
})

describe('restoreDatabase', () => {
  const options = (overrides: Partial<Parameters<typeof restoreDatabase>[0]> = {}) => ({
    current,
    closeCurrent: () => current.$client.close(),
    dbPath,
    file: '',
    migrationsFolder: MIGRATIONS,
    workDir: dir,
    safetyFolder: join(dir, 'safety'),
    now: new Date(2026, 8, 27, 15, 0, 0),
    ...overrides
  })

  it('brings back a deleted document', async () => {
    const doc = add(current, vesselA)
    const file = await backup()
    softDeleteDocument(current, doc.id)
    await restoreDatabase(options({ file }))
    const restored = openDb(dbPath, MIGRATIONS)
    expect(getDocumentView(restored, doc.id).deletedAt).toBeNull()
    expect(add(restored, vesselA).serialNo).toBe('A00002')
    restored.$client.close()
  })

  it('leaves the license files next to the database alone', async () => {
    const file = await backup()
    writeFileSync(join(dir, LICENSE_FILE), 'license text')
    writeFileSync(join(dir, LICENSE_STATE_FILE), '{"lastSeen":"2026-09-27T12:00:00.000Z"}')
    await restoreDatabase(options({ file }))
    expect(readFileSync(join(dir, LICENSE_FILE), 'utf8')).toBe('license text')
    expect(readFileSync(join(dir, LICENSE_STATE_FILE), 'utf8')).toContain('2026-09-27')
  })

  it('writes a safety backup of the current data before replacing it', async () => {
    const file = await backup()
    add(current, vesselA)
    let safetyAtClose: string[] = []
    const { safetyBackup } = await restoreDatabase(
      options({
        file,
        closeCurrent: () => {
          safetyAtClose = readdirSync(join(dir, 'safety'))
          current.$client.close()
        }
      })
    )
    expect(safetyBackup).toBe(
      join(dir, 'safety', 'land-bl_before-restore_2026-09-27_15-00-00.sqlite')
    )
    expect(safetyAtClose).toEqual(['land-bl_before-restore_2026-09-27_15-00-00.sqlite'])
    const safety = openDb(safetyBackup, MIGRATIONS)
    expect(safety.select().from(documents).all()).toHaveLength(1)
    safety.$client.close()
  })

  it('stops, and changes nothing, if the safety backup fails', async () => {
    const doc = add(current, vesselA)
    const file = await backup()
    softDeleteDocument(current, doc.id)
    const blocked = join(dir, 'blocked')
    writeFileSync(blocked, '')
    let closed = false
    await expect(
      restoreDatabase(
        options({ file, safetyFolder: join(blocked, 'x'), closeCurrent: () => (closed = true) })
      )
    ).rejects.toThrow('BACKUP_FOLDER_UNAVAILABLE')
    expect(closed).toBe(false)
    expect(getDocumentView(current, doc.id).deletedAt).not.toBeNull()
  })

  it('refuses a bad file before touching anything', async () => {
    const text = join(dir, 'x.txt')
    writeFileSync(text, 'nope')
    await expect(restoreDatabase(options({ file: text }))).rejects.toThrow('BACKUP_NOT_DATABASE')
    expect(existsSync(join(dir, 'safety'))).toBe(false)
    expect(current.$client.open).toBe(true)
  })
})

describe('replaceDatabase', () => {
  it('puts the old file back if the swap fails halfway', async () => {
    add(current, vesselA)
    const file = await backup()
    const prepared = prepare(file)
    add(current, vesselA)
    current.$client.close()

    let calls = 0
    const failingRename = (from: string, to: string): void => {
      if (to === dbPath && ++calls === 1) throw new Error('file locked')
      renameSync(from, to)
    }
    expect(codeOf(() => replaceDatabase(dbPath, prepared.path, failingRename))).toBe(
      'RESTORE_FAILED'
    )
    prepared.dispose()

    const db = openDb(dbPath, MIGRATIONS)
    expect(db.select().from(documents).all()).toHaveLength(2)
    db.$client.close()
    expect(readdirSync(dir).filter((f) => f.includes('.old') || f.includes('.restore'))).toEqual([])
  })

  it('replaces the database and leaves no stray files', async () => {
    const file = await backup()
    add(current, vesselA)
    const prepared = prepare(file)
    current.$client.close()
    replaceDatabase(dbPath, prepared.path)
    prepared.dispose()
    copyFileSync(dbPath, join(dir, 'check.sqlite'))
    const db = openDb(join(dir, 'check.sqlite'), MIGRATIONS)
    expect(db.select().from(documents).all()).toHaveLength(0)
    db.$client.close()
    expect(
      readdirSync(dir).filter((f) => f.startsWith('land-bl.sqlite') && f !== 'land-bl.sqlite')
    ).toEqual([])
  })
})
