import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from './client'

export const MIGRATIONS = join(__dirname, 'migrations')

/** A fresh, fully migrated in-memory database for tests. */
export function openTestDb(): Db {
  return openDb(':memory:', MIGRATIONS)
}

/**
 * A copy of the migrations folder that stops at `tag` (e.g. '0001_history_search'), to build a
 * database as an older app version left it.
 */
export function migrationsUpTo(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'land-bl-migrations-'))
  cpSync(MIGRATIONS, dir, { recursive: true })
  const journalPath = join(dir, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] }
  const last = journal.entries.findIndex((e) => e.tag === tag)
  if (last === -1) throw new Error(`unknown migration ${tag}`)
  journal.entries = journal.entries.slice(0, last + 1)
  writeFileSync(journalPath, JSON.stringify(journal))
  return dir
}
