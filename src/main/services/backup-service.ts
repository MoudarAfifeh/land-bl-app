/**
 * Backups for the UI and the schedule: the folder and file dialogs, "back up now", the automatic
 * backup, and restore followed by a restart. The work itself is in backup.ts and restore.ts.
 */
import { join } from 'node:path'
import { app, dialog, type BrowserWindow, type OpenDialogOptions } from 'electron'
import type { Api, BackupStatus } from '@shared/api'
import { errorMessages } from '@shared/errors'
import type { Db } from '../db/client'
import { closeDb, dbFilePath, migrationsFolder } from '../db'
import { documents } from '../db/schema'
import { BACKUP_CONFIG_FILE } from '../user-data'
import {
  backupStatus,
  isBackupDue,
  readBackupConfig,
  recordBackup,
  updateBackupConfig
} from './backup'
import { prepareRestore, restoreDatabase } from './restore'

/** How often a running app checks whether the daily backup is due. */
const CHECK_EVERY_MS = 60 * 60 * 1000

export type BackupService = Api['backup'] & {
  /** Backs up now if the last backup is older than 24 hours, then checks every hour. */
  startSchedule(): void
}

/** Quits and starts again on the restored database. */
function restart(): void {
  // The e2e test relaunches the app itself: a copy started here would take the single-instance
  // lock away from it.
  if (!process.env.LAND_BL_NO_RELAUNCH) app.relaunch()
  app.exit(0)
}

export function createBackupService(db: Db, parent: () => BrowserWindow | null): BackupService {
  const dataFolder = app.getPath('userData')
  const configPath = join(dataFolder, BACKUP_CONFIG_FILE)
  const defaultFolder = join(app.getPath('documents'), 'LandBL-Backups')
  const status = (): BackupStatus => backupStatus(configPath, defaultFolder, dataFolder, new Date())

  // One backup or restore at a time; after a restore the connection is closed for good.
  let queue: Promise<unknown> = Promise.resolve()
  let closed = false
  function exclusive<T>(run: () => Promise<T>): Promise<T> {
    const next = queue.then(run, run)
    queue = next.catch(() => undefined)
    return next
  }

  async function askPath(options: OpenDialogOptions): Promise<string | null> {
    const owner = parent()
    const choice = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    return choice.canceled || choice.filePaths.length === 0 ? null : choice.filePaths[0]
  }

  const backUp = (): Promise<unknown> =>
    exclusive(() => recordBackup(db, configPath, status().folder, new Date()))

  async function backUpIfDue(): Promise<void> {
    if (closed || !isBackupDue(readBackupConfig(configPath).lastBackupAt, new Date())) return
    // Nothing to lose on a fresh install (this also keeps test runs out of Documents).
    if (!db.select({ id: documents.id }).from(documents).limit(1).get()) return
    try {
      await backUp()
    } catch {
      // Recorded in the config; Settings and the home page show it.
    }
  }

  return {
    status: async () => status(),

    async chooseFolder() {
      const folder = await askPath({
        title: 'اختيار مجلد النسخ الاحتياطي',
        defaultPath: status().folder,
        properties: ['openDirectory', 'createDirectory']
      })
      if (!folder) return null
      updateBackupConfig(configPath, { folder })
      return status()
    },

    async runNow() {
      await backUp()
      return status()
    },

    async pickRestoreFile() {
      const file = await askPath({
        title: 'اختيار نسخة احتياطية للاستعادة',
        defaultPath: status().folder,
        properties: ['openFile'],
        filters: [
          { name: 'نسخة احتياطية', extensions: ['sqlite'] },
          { name: 'كل الملفات', extensions: ['*'] }
        ]
      })
      if (!file) return null
      const prepared = prepareRestore(file, db, migrationsFolder(), app.getPath('temp'))
      prepared.dispose()
      return prepared.preview
    },

    restore: (file) =>
      exclusive(async () => {
        try {
          await restoreDatabase({
            current: db,
            closeCurrent: () => {
              closed = true
              closeDb()
            },
            dbPath: dbFilePath(),
            file,
            migrationsFolder: migrationsFolder(),
            workDir: app.getPath('temp'),
            safetyFolder: status().folder,
            now: new Date()
          })
        } catch (error) {
          if (!closed) throw error
          // The swap rolled back, but the connection is closed: start again on the old data.
          dialog.showErrorBox('تعذّرت الاستعادة', errorMessages.RESTORE_FAILED)
          restart()
          throw error
        }
        // Let the reply reach the renderer before quitting.
        setTimeout(restart, 500)
      }),

    startSchedule() {
      void backUpIfDue()
      setInterval(() => void backUpIfDue(), CHECK_EVERY_MS)
    }
  }
}
