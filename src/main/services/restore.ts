/**
 * Restoring a backup. The chosen file is never opened in place: it is copied to a work folder,
 * checked (a SQLite file, not damaged, this app's tables, not from a newer version), migrated to
 * the current schema, and compared with the current data for the confirmation. Only then, after a
 * safety backup of the current data, does the copy replace the database file. The caller restarts
 * the app afterwards. No Electron here (see backup-service.ts).
 *
 * Serials are never issued twice: when the current data has gone further than the backup for the
 * same vessel (same id and letter), the restored counter keeps the higher number.
 */
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { count, desc, eq, isNotNull } from 'drizzle-orm'
import type { RestorePreview } from '@shared/api'
import { ServiceError } from '@shared/errors'
import { openDb, type Db } from '../db/client'
import { counters, documents, vessels } from '../db/schema'
import { writeBackup } from './backup'
import { formatSerial } from './serial'

/** Tables a database of this app always has. */
const APP_TABLES = ['vessels', 'counters', 'documents', 'settings', '__drizzle_migrations']

/** Timestamp of the newest migration this app ships (drizzle's `folderMillis`). */
function latestMigration(migrationsFolder: string): number {
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
  ) as {
    entries: { when: number }[]
  }
  return Math.max(...journal.entries.map((e) => e.when))
}

/** A thrown SQLite error as a code the user can read. */
function backupError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error
  const code = (error as { code?: unknown }).code
  if (code === 'SQLITE_NOTADB') return new ServiceError('BACKUP_NOT_DATABASE')
  if (typeof code !== 'string' || !code.startsWith('SQLITE_CORRUPT')) console.error(error)
  return new ServiceError('BACKUP_CORRUPTED')
}

/** Checks the copy before anything writes to it (migrations would, for an older schema). */
function checkCandidate(path: string, migrationsFolder: string): void {
  let raw: Database.Database | undefined
  try {
    raw = new Database(path, { fileMustExist: true })
    const check = raw.pragma('integrity_check') as { integrity_check: string }[]
    if (check.length !== 1 || check[0].integrity_check !== 'ok')
      throw new ServiceError('BACKUP_CORRUPTED')

    const tables = new Set(
      (
        raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
          name: string
        }[]
      ).map((t) => t.name)
    )
    if (!APP_TABLES.every((t) => tables.has(t))) throw new ServiceError('BACKUP_NOT_APP')

    const { last } = raw
      .prepare('SELECT max(created_at) AS last FROM __drizzle_migrations')
      .get() as {
      last: number | null
    }
    if (Number(last ?? 0) > latestMigration(migrationsFolder))
      throw new ServiceError('BACKUP_TOO_NEW')
  } catch (error) {
    throw backupError(error)
  } finally {
    raw?.close()
  }
}

interface VesselNumbers {
  id: number
  name: string
  prefix: string
  isActive: boolean
  lastNumber: number
}

function vesselNumbers(db: Db): VesselNumbers[] {
  const last = new Map(
    db
      .select()
      .from(counters)
      .all()
      .map((c) => [c.vesselId, c.lastNumber])
  )
  return db
    .select({
      id: vessels.id,
      name: vessels.name,
      prefix: vessels.prefix,
      isActive: vessels.isActive
    })
    .from(vessels)
    .orderBy(vessels.id)
    .all()
    .map((v) => ({ ...v, lastNumber: last.get(v.id) ?? 0 }))
}

/** Compares the migrated backup with the current data, and raises its counters where needed. */
function compareAndKeepHigherCounters(
  backup: Db,
  current: Db
): Omit<RestorePreview, 'file' | 'fileDate'> {
  const backupVessels = vesselNumbers(backup)
  const currentVessels = new Map(vesselNumbers(current).map((v) => [v.id, v]))
  const sameVessel = (b: VesselNumbers): VesselNumbers | undefined => {
    const c = currentVessels.get(b.id)
    return c && c.prefix === b.prefix ? c : undefined
  }

  const previewVessels: RestorePreview['vessels'] = []
  for (const b of backupVessels) {
    const higher = (sameVessel(b)?.lastNumber ?? 0) > b.lastNumber
    const lastNumber = higher ? sameVessel(b)!.lastNumber : b.lastNumber
    if (higher)
      backup
        .insert(counters)
        .values({ vesselId: b.id, lastNumber })
        .onConflictDoUpdate({ target: counters.vesselId, set: { lastNumber } })
        .run()
    if (b.isActive || higher)
      previewVessels.push({
        name: b.name,
        prefix: b.prefix,
        nextSerial: formatSerial(b.prefix, lastNumber + 1),
        keptHigher: higher
      })
  }

  const matched = new Set(backupVessels.filter(sameVessel).map((b) => b.id))
  const lostVessels = [...currentVessels.values()]
    .filter((c) => !matched.has(c.id))
    .map((c) => ({
      name: c.name,
      prefix: c.prefix,
      lastSerial:
        current
          .select({ serialNo: documents.serialNo })
          .from(documents)
          .where(eq(documents.vesselId, c.id))
          .orderBy(desc(documents.number))
          .limit(1)
          .get()?.serialNo ?? null
    }))

  // Documents are never hard-deleted and ids only grow, so a current document the backup
  // doesn't have (same id and serial) was saved after it.
  const backupSerials = new Map(
    backup
      .select({ id: documents.id, serialNo: documents.serialNo })
      .from(documents)
      .all()
      .map((d) => [d.id, d.serialNo])
  )
  const removedDocuments = current
    .select({ id: documents.id, serialNo: documents.serialNo })
    .from(documents)
    .all()
    .filter((d) => backupSerials.get(d.id) !== d.serialNo).length

  const n = (q: { n: number } | undefined): number => q?.n ?? 0
  return {
    documentCount: n(backup.select({ n: count() }).from(documents).get()),
    deletedCount: n(
      backup.select({ n: count() }).from(documents).where(isNotNull(documents.deletedAt)).get()
    ),
    newestSerial:
      backup
        .select({ serialNo: documents.serialNo })
        .from(documents)
        .orderBy(desc(documents.id))
        .limit(1)
        .get()?.serialNo ?? null,
    vessels: previewVessels,
    removedDocuments,
    lostVessels
  }
}

export interface PreparedRestore {
  /** The checked, migrated copy with counters adjusted, ready to become the database. */
  path: string
  preview: RestorePreview
  /** Deletes the work copy. */
  dispose: () => void
}

/** Copies, checks, migrates and compares a backup file. The chosen file is only read. */
export function prepareRestore(
  file: string,
  current: Db,
  migrationsFolder: string,
  workDir: string
): PreparedRestore {
  const work = mkdtempSync(join(workDir, 'restore-'))
  const dispose = (): void => rmSync(work, { recursive: true, force: true })
  const path = join(work, 'restore.sqlite')
  try {
    let fileDate: string
    try {
      fileDate = statSync(file).mtime.toISOString()
      copyFileSync(file, path)
    } catch (error) {
      console.error(error)
      throw new ServiceError('BACKUP_NOT_DATABASE')
    }
    checkCandidate(path, migrationsFolder)

    let backup: Db
    try {
      backup = openDb(path, migrationsFolder)
    } catch (error) {
      throw backupError(error)
    }
    try {
      const preview = { file, fileDate, ...compareAndKeepHigherCounters(backup, current) }
      return { path, preview, dispose }
    } finally {
      backup.$client.close() // checkpoints the WAL into the file
    }
  } catch (error) {
    dispose()
    throw error
  }
}

type Rename = (from: string, to: string) => void

const SIDE_FILES = ['', '-wal', '-shm']

/**
 * Swaps the database file (closed by the caller) for the prepared copy. The old file and its WAL
 * are moved aside first and put back if anything fails, so the result is the old data or the new,
 * never a mix. `rename` is replaceable only for tests.
 */
export function replaceDatabase(
  dbPath: string,
  preparedPath: string,
  rename: Rename = renameSync
): void {
  const incoming = `${dbPath}.restore`
  const moved: string[] = []
  try {
    copyFileSync(preparedPath, incoming)
    for (const side of SIDE_FILES) {
      if (!existsSync(dbPath + side)) continue
      rename(dbPath + side, `${dbPath}.old${side}`)
      moved.push(side)
    }
    rename(incoming, dbPath)
  } catch (error) {
    console.error(error)
    rmSync(incoming, { force: true })
    for (const side of moved.reverse()) renameSync(`${dbPath}.old${side}`, dbPath + side)
    throw new ServiceError('RESTORE_FAILED')
  }
  for (const side of moved) rmSync(`${dbPath}.old${side}`, { force: true })
}

export interface RestoreOptions {
  current: Db
  /** Closes the app's connection; called only once the safety backup is written. */
  closeCurrent: () => void
  dbPath: string
  file: string
  migrationsFolder: string
  workDir: string
  safetyFolder: string
  now: Date
  rename?: Rename
}

/**
 * Checks the file again (never trusting an earlier preview), backs up the current data, closes it
 * and swaps the files. The caller restarts the app.
 */
export async function restoreDatabase(
  o: RestoreOptions
): Promise<{ safetyBackup: string; preview: RestorePreview }> {
  const prepared = prepareRestore(o.file, o.current, o.migrationsFolder, o.workDir)
  try {
    const safetyBackup = await writeBackup(o.current, o.safetyFolder, o.now, 'before-restore')
    o.closeCurrent()
    replaceDatabase(o.dbPath, prepared.path, o.rename)
    return { safetyBackup, preview: prepared.preview }
  } finally {
    prepared.dispose()
  }
}
