import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { settingFields } from '@shared/fields'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database }
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Opens (or creates) the database, applies pending migrations and seeds default settings.
 * `filePath` is `:memory:` in tests.
 */
export function openDb(filePath: string, migrationsFolder: string): Db {
  const sqlite = new Database(filePath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')

  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  seedSettings(db)
  return db
}

/** Inserts defaults for settings that have none yet. Never overwrites a user's value. */
function seedSettings(db: Db): void {
  for (const f of settingFields) {
    if (!('default' in f)) continue
    db.insert(schema.settings)
      .values({ key: f.key, value: f.default.value })
      .onConflictDoNothing()
      .run()
  }
}
