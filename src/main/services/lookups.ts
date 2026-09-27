/**
 * Lookup lists behind the form's autocompletes. New names are added when a document is saved;
 * stored addresses and passports are only replaced when the user asks (see shared/lookups.ts).
 * Lists are small, so matching by name happens in JS where case-folding covers every script.
 */
import { asc, eq, sql } from 'drizzle-orm'
import {
  findByName,
  nextStoredValue,
  normalizeName,
  type Driver,
  type Party,
  type Tanker
} from '@shared/lookups'
import type { Db, Tx } from '../db/client'
import { drivers, parties, tankers } from '../db/schema'

const touched = { updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` }

export interface SaveLookupOptions {
  /** Replace a different stored address / passport with the document's value. */
  updateStored?: boolean
}

export function listParties(db: Db | Tx): Party[] {
  return db
    .select({ id: parties.id, name: parties.name, address: parties.address })
    .from(parties)
    .orderBy(asc(parties.name))
    .all()
}

export function listDrivers(db: Db | Tx): Driver[] {
  return db
    .select({ id: drivers.id, name: drivers.name, passportNo: drivers.passportNo })
    .from(drivers)
    .orderBy(asc(drivers.name))
    .all()
}

export function listTankers(db: Db | Tx): Tanker[] {
  return db
    .select({ id: tankers.id, tankerNo: tankers.tankerNo })
    .from(tankers)
    .orderBy(asc(tankers.tankerNo))
    .all()
}

export function saveParty(
  db: Db | Tx,
  name: string,
  address: string | null,
  { updateStored = false }: SaveLookupOptions = {}
): void {
  const clean = normalizeName(name)
  if (clean === '') return
  const existing = findByName(listParties(db), (p) => p.name, clean)
  if (!existing) {
    db.insert(parties)
      .values({ name: clean, address: address?.trim() || null })
      .run()
    return
  }
  const next = nextStoredValue(address, existing.address, updateStored)
  if (next !== undefined)
    db.update(parties)
      .set({ address: next, ...touched })
      .where(eq(parties.id, existing.id))
      .run()
}

export function saveDriver(
  db: Db | Tx,
  name: string,
  passportNo: string | null,
  { updateStored = false }: SaveLookupOptions = {}
): void {
  const clean = normalizeName(name)
  if (clean === '') return
  const existing = findByName(listDrivers(db), (d) => d.name, clean)
  if (!existing) {
    db.insert(drivers)
      .values({ name: clean, passportNo: passportNo?.trim() || null })
      .run()
    return
  }
  const next = nextStoredValue(passportNo, existing.passportNo, updateStored)
  if (next !== undefined)
    db.update(drivers)
      .set({ passportNo: next, ...touched })
      .where(eq(drivers.id, existing.id))
      .run()
}

export function saveTanker(db: Db | Tx, tankerNo: string): void {
  const clean = normalizeName(tankerNo)
  if (clean === '' || findByName(listTankers(db), (t) => t.tankerNo, clean)) return
  db.insert(tankers).values({ tankerNo: clean }).run()
}
