import { join } from 'node:path'
import { app } from 'electron'
import { openDb, type Db } from './client'

let db: Db | null = null

/** Migrations ship as extraResources when packaged; in dev they're read from the source tree. */
function migrationsFolder(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'migrations')
    : join(app.getAppPath(), 'src/main/db/migrations')
}

/** Opens the app database in userData and applies pending migrations. Call once on startup. */
export function initDb(): Db {
  db = openDb(join(app.getPath('userData'), 'land-bl.sqlite'), migrationsFolder())
  return db
}

export function getDb(): Db {
  if (!db) throw new Error('Database not initialised')
  return db
}

export function closeDb(): void {
  db?.$client.close()
  db = null
}
