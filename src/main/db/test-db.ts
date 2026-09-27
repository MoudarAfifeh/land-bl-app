import { join } from 'node:path'
import { openDb, type Db } from './client'

/** A fresh, fully migrated in-memory database for tests. */
export function openTestDb(): Db {
  return openDb(':memory:', join(__dirname, 'migrations'))
}
