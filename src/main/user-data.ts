/**
 * Where the app keeps its data: `%APPDATA%\land-bl`, set explicitly in index.ts so it no longer
 * follows the name in package.json. Before 1.0.0 it was `%APPDATA%\land-bl-app`; on the first start
 * with the new folder missing, the app's own files are copied over. The old folder is left as it
 * was, as a fallback. No Electron here, so tests call it directly.
 */
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { LICENSE_FILE, LICENSE_STATE_FILE } from './license/manager'

export const DATA_FOLDER = 'land-bl'
export const OLD_DATA_FOLDER = 'land-bl-app'

export const DB_FILE = 'land-bl.sqlite'
export const BACKUP_CONFIG_FILE = 'backup.json'

/**
 * The app's files, with SQLite's side files (a crash can leave data in the -wal). Chromium's caches
 * and storage aren't copied: the UI keeps nothing there.
 */
const APP_FILES = [
  DB_FILE,
  `${DB_FILE}-wal`,
  `${DB_FILE}-shm`,
  BACKUP_CONFIG_FILE,
  LICENSE_FILE,
  LICENSE_STATE_FILE
]

export interface DataCopy {
  from: string
  to: string
  files: string[]
}

/**
 * Copies the app's files from the old folder when the new one doesn't exist yet. Returns what was
 * copied, or null when there was nothing to do. The copy goes to a temporary folder renamed at the
 * end: if it fails half way, the new folder still doesn't exist and the next start tries again.
 */
export function copyOldUserData(appData: string): DataCopy | null {
  const from = join(appData, OLD_DATA_FOLDER)
  const to = join(appData, DATA_FOLDER)
  if (existsSync(to) || !existsSync(from)) return null

  const files = APP_FILES.filter((name) => existsSync(join(from, name)))
  if (files.length === 0) return null

  const temp = join(appData, `${DATA_FOLDER}.copying-${process.pid}`)
  rmSync(temp, { recursive: true, force: true })
  try {
    mkdirSync(temp)
    for (const name of files) copyFileSync(join(from, name), join(temp, name))
    renameSync(temp, to)
  } catch (error) {
    rmSync(temp, { recursive: true, force: true })
    // Another instance finished the same copy first.
    if (existsSync(to)) return null
    throw error
  }
  return { from, to, files }
}
