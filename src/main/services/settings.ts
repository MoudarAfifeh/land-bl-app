import { eq, sql } from 'drizzle-orm'
import type { SettingKey } from '@shared/fields'
import type { CustomsAgents } from '@shared/api'
import { customsAgentsSchema, type Settings } from '@shared/schemas'
import type { Db, Tx } from '../db/client'
import { settings } from '../db/schema'

export function getSetting<K extends SettingKey>(db: Db | Tx, key: K): Settings[K] | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get()
  return (row?.value ?? null) as Settings[K] | null
}

export function setSetting<K extends SettingKey>(db: Db | Tx, key: K, value: Settings[K]): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` }
    })
    .run()
}

/** The two agent blocks printed and exported on every document. */
export function getCustomsAgents(db: Db | Tx): CustomsAgents {
  return {
    customsAgent1: getSetting(db, 'customsAgent1'),
    customsAgent2: getSetting(db, 'customsAgent2')
  }
}

/** Saves both agent blocks. Only documents saved afterwards get the new text. */
export function setCustomsAgents(db: Db, input: CustomsAgents): CustomsAgents {
  const data = customsAgentsSchema.parse(input)
  db.transaction((tx) => {
    setSetting(tx, 'customsAgent1', data.customsAgent1)
    setSetting(tx, 'customsAgent2', data.customsAgent2)
  })
  return data
}
