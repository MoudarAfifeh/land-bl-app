/**
 * Backups of the database file. Always through SQLite's online backup API (better-sqlite3's
 * `backup()`), never a raw copy of the open file. No Electron here: the folder dialog and the
 * startup schedule are in backup-service.ts.
 *
 * The backup config (folder, last backup, last error) lives in a JSON file next to the database,
 * not in the settings table: restoring an older database must not bring back an older folder or
 * "last backup" date.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join, win32 } from 'node:path'
import type { BackupAge, BackupStatus } from '@shared/api'
import { isErrorCode, ServiceError, type ErrorCode } from '@shared/errors'
import type { Db } from '../db/client'

export const BACKUP_KEEP = 30

const HOUR_MS = 3_600_000
const DUE_AFTER_MS = 24 * HOUR_MS
const STALE_AFTER_MS = 7 * 24 * HOUR_MS

/** A regular backup is rotated; a safety backup (taken before a restore) is kept. */
export type BackupKind = 'regular' | 'before-restore'

const pad = (n: number): string => String(n).padStart(2, '0')

/** Local date and time, sortable: 2026-09-27_14-30-05. */
function stamp(d: Date): string {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `${date}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

export function backupFileName(now: Date, kind: BackupKind = 'regular', n = 0): string {
  const suffix = n > 0 ? `-${n}` : ''
  const kindPart = kind === 'before-restore' ? 'before-restore_' : ''
  return `land-bl_${kindPart}${stamp(now)}${suffix}.sqlite`
}

/** Regular backups only: land-bl_<stamp>[-n].sqlite. */
const REGULAR = /^land-bl_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})(?:-(\d+))?\.sqlite$/

/** The regular backups in a folder, newest first. Other files are ignored. */
export function listBackups(folder: string): string[] {
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .map((name) => ({ name, m: REGULAR.exec(name) }))
    .filter((f): f is { name: string; m: RegExpExecArray } => f.m !== null)
    .sort((a, b) => b.m[1].localeCompare(a.m[1]) || Number(b.m[2] ?? 0) - Number(a.m[2] ?? 0))
    .map((f) => join(folder, f.name))
}

/** Deletes regular backups beyond the newest `keep`; returns the deleted paths. */
export function rotateBackups(folder: string, keep = BACKUP_KEEP): string[] {
  const old = listBackups(folder).slice(keep)
  for (const path of old) rmSync(path, { force: true })
  return old
}

export function isBackupDue(lastAt: string | null, now: Date): boolean {
  return lastAt === null || now.getTime() - Date.parse(lastAt) >= DUE_AFTER_MS
}

export function backupAge(lastAt: string | null, now: Date): BackupAge {
  if (lastAt === null) return 'none'
  return now.getTime() - Date.parse(lastAt) > STALE_AFTER_MS ? 'stale' : 'ok'
}

/**
 * Writes a backup of `db` into `folder` (created if needed) and, for a regular one, rotates the
 * folder. Written as `.partial` then renamed, so an interrupted backup never looks complete.
 */
export async function writeBackup(
  db: Db,
  folder: string,
  now: Date,
  kind: BackupKind = 'regular'
): Promise<string> {
  try {
    mkdirSync(folder, { recursive: true })
  } catch {
    throw new ServiceError('BACKUP_FOLDER_UNAVAILABLE')
  }
  let n = 0
  while (existsSync(join(folder, backupFileName(now, kind, n)))) n++
  const path = join(folder, backupFileName(now, kind, n))
  const partial = `${path}.partial`
  try {
    await db.$client.backup(partial)
    renameSync(partial, path)
  } catch (error) {
    rmSync(partial, { force: true })
    console.error(error)
    throw new ServiceError(existsSync(folder) ? 'BACKUP_FAILED' : 'BACKUP_FOLDER_UNAVAILABLE')
  }
  if (kind === 'regular') rotateBackups(folder)
  return path
}

export interface BackupConfig {
  /** Chosen by the user; null = the default folder. */
  folder: string | null
  lastBackupAt: string | null
  lastBackupPath: string | null
  lastError: { at: string; code: ErrorCode } | null
}

const emptyConfig: BackupConfig = {
  folder: null,
  lastBackupAt: null,
  lastBackupPath: null,
  lastError: null
}

/** A missing or unreadable file reads as "never backed up". */
export function readBackupConfig(path: string): BackupConfig {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<BackupConfig>
    const text = (v: unknown): string | null => (typeof v === 'string' ? v : null)
    const error = raw.lastError
    return {
      folder: text(raw.folder),
      lastBackupAt: text(raw.lastBackupAt),
      lastBackupPath: text(raw.lastBackupPath),
      lastError:
        error && typeof error.at === 'string' && isErrorCode(error.code)
          ? { at: error.at, code: error.code }
          : null
    }
  } catch {
    return { ...emptyConfig }
  }
}

export function writeBackupConfig(path: string, config: BackupConfig): void {
  writeFileSync(`${path}.tmp`, JSON.stringify(config, null, 2))
  renameSync(`${path}.tmp`, path)
}

export function updateBackupConfig(path: string, patch: Partial<BackupConfig>): BackupConfig {
  const next = { ...readBackupConfig(path), ...patch }
  writeBackupConfig(path, next)
  return next
}

/** Backs up into `folder` and records the result (success, or the error) in the config. */
export async function recordBackup(
  db: Db,
  configPath: string,
  folder: string,
  now: Date
): Promise<BackupConfig> {
  try {
    const path = await writeBackup(db, folder, now)
    return updateBackupConfig(configPath, {
      lastBackupAt: now.toISOString(),
      lastBackupPath: path,
      lastError: null
    })
  } catch (error) {
    const code = error instanceof ServiceError ? error.code : 'BACKUP_FAILED'
    updateBackupConfig(configPath, { lastError: { at: now.toISOString(), code } })
    throw error instanceof ServiceError ? error : new ServiceError(code)
  }
}

/** Windows paths only (the app is Windows-only): same drive letter or UNC share. */
function sameDrive(a: string, b: string): boolean {
  return (
    win32.parse(win32.resolve(a)).root.toLowerCase() ===
    win32.parse(win32.resolve(b)).root.toLowerCase()
  )
}

export function backupStatus(
  configPath: string,
  defaultFolder: string,
  dataFolder: string,
  now: Date
): BackupStatus {
  const config = readBackupConfig(configPath)
  const folder = config.folder ?? defaultFolder
  return {
    folder,
    lastBackupAt: config.lastBackupAt,
    lastBackupPath: config.lastBackupPath,
    lastError: config.lastError,
    age: backupAge(config.lastBackupAt, now),
    sameDriveAsData: sameDrive(folder, dataFolder)
  }
}
