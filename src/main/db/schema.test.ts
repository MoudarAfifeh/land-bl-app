import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { documentFields, type FieldType } from '@shared/fields'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { openDb } from './client'
import { documents, settings } from './schema'
import { MIGRATIONS, migrationsUpTo, openTestDb } from './test-db'

const snake = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

const columnTypeFor: Record<FieldType, string> = {
  string: 'SQLiteText',
  date: 'SQLiteText',
  number: 'SQLiteReal',
  ref: 'SQLiteInteger',
  boolean: 'SQLiteBoolean',
  stringList: 'SQLiteTextJson'
}

describe('documents table matches fields.ts', () => {
  const columns = getTableColumns(documents)

  for (const f of documentFields) {
    it(`${f.key} → ${snake(f.key)}`, () => {
      const col = columns[f.key as keyof typeof columns]
      expect(col, f.key).toBeDefined()
      expect(col.name).toBe(snake(f.key))
      expect(col.columnType).toBe(columnTypeFor[f.type])
      // Required inputs are NOT NULL; the auto serial is NOT NULL too.
      if (f.required || f.key === 'serialNo') expect(col.notNull).toBe(true)
    })
  }
})

describe('openDb', () => {
  it('runs migrations and seeds the customs agent defaults', () => {
    const db = openTestDb()
    const rows = db.select().from(settings).all()
    expect(rows.map((r) => r.key).sort()).toEqual(['customsAgent1', 'customsAgent2'])
    expect(rows.find((r) => r.key === 'customsAgent2')?.value).toContain('معبر الوليد')
  })

  it('gives documents saved before migration 0002 the agent blocks in settings', () => {
    const db = openDb(':memory:', migrationsUpTo('0001_history_search'))
    db.$client.exec(`
      UPDATE settings SET value = json_quote('سوري\nسطر 2') WHERE key = 'customsAgent1';
      UPDATE settings SET value = 'null' WHERE key = 'customsAgent2';
      INSERT INTO vessels (name, prefix) VALUES ('MT Old', 'A');
      INSERT INTO documents (vessel_id, number, serial_no, issue_date, shipper_name,
        consignee_name, tanker_no, driver_name) VALUES (1, 1, 'A00001', '2026-09-01', 's', 'c', 't', 'd');
    `)
    migrate(db, { migrationsFolder: MIGRATIONS })
    const doc = db.select().from(documents).get()
    expect(doc?.customsAgent1).toBe('سوري\nسطر 2')
    expect(doc?.customsAgent2).toBeNull()
  })
})
