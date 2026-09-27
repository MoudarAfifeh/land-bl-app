/**
 * Lookup lists behind the form's autocompletes. New names are added when a document is saved;
 * stored addresses and passports are only replaced when the user asks (see shared/lookups.ts).
 * Lists are small, so matching by name happens in JS where case-folding covers every script.
 */
import { asc, eq, sql } from 'drizzle-orm'
import { ServiceError } from '@shared/errors'
import {
  findByName,
  findDuplicate,
  nextStoredValue,
  normalizeName,
  type Driver,
  type Party,
  type Tanker
} from '@shared/lookups'
import {
  driverInputSchema,
  partyInputSchema,
  tankerInputSchema,
  type DriverInput,
  type PartyInput,
  type TankerInput
} from '@shared/schemas'
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

/*
 * Settings: add, edit and delete entries. An exact duplicate (ignoring case and spaces) is
 * refused; spelling variants are only warned about in the UI (findSimilar). Saved documents keep
 * their own copy of every value, so nothing here changes them.
 */

function assertUnique<T extends { id: number }>(
  items: readonly T[],
  nameOf: (item: T) => string,
  name: string,
  exceptId: number | null = null
): void {
  if (findDuplicate(items, nameOf, name, exceptId)) throw new ServiceError('LOOKUP_DUPLICATE')
}

function found<T>(row: T | undefined): T {
  if (row === undefined) throw new ServiceError('LOOKUP_NOT_FOUND')
  return row
}

function deleted(result: { changes: number }): void {
  if (result.changes === 0) throw new ServiceError('LOOKUP_NOT_FOUND')
}

const partyColumns = { id: parties.id, name: parties.name, address: parties.address }
const driverColumns = { id: drivers.id, name: drivers.name, passportNo: drivers.passportNo }
const tankerColumns = { id: tankers.id, tankerNo: tankers.tankerNo }

export function createParty(db: Db, input: PartyInput): Party {
  const data = partyInputSchema.parse(input)
  const name = normalizeName(data.name)
  assertUnique(listParties(db), (p) => p.name, name)
  return db.insert(parties).values({ name, address: data.address }).returning(partyColumns).get()
}

export function updateParty(db: Db, id: number, input: PartyInput): Party {
  const data = partyInputSchema.parse(input)
  const name = normalizeName(data.name)
  assertUnique(listParties(db), (p) => p.name, name, id)
  return found(
    db
      .update(parties)
      .set({ name, address: data.address, ...touched })
      .where(eq(parties.id, id))
      .returning(partyColumns)
      .get()
  )
}

export function deleteParty(db: Db, id: number): void {
  deleted(db.delete(parties).where(eq(parties.id, id)).run())
}

export function createDriver(db: Db, input: DriverInput): Driver {
  const data = driverInputSchema.parse(input)
  const name = normalizeName(data.name)
  assertUnique(listDrivers(db), (d) => d.name, name)
  return db
    .insert(drivers)
    .values({ name, passportNo: data.passportNo })
    .returning(driverColumns)
    .get()
}

export function updateDriver(db: Db, id: number, input: DriverInput): Driver {
  const data = driverInputSchema.parse(input)
  const name = normalizeName(data.name)
  assertUnique(listDrivers(db), (d) => d.name, name, id)
  return found(
    db
      .update(drivers)
      .set({ name, passportNo: data.passportNo, ...touched })
      .where(eq(drivers.id, id))
      .returning(driverColumns)
      .get()
  )
}

export function deleteDriver(db: Db, id: number): void {
  deleted(db.delete(drivers).where(eq(drivers.id, id)).run())
}

export function createTanker(db: Db, input: TankerInput): Tanker {
  const tankerNo = normalizeName(tankerInputSchema.parse(input).tankerNo)
  assertUnique(listTankers(db), (t) => t.tankerNo, tankerNo)
  return db.insert(tankers).values({ tankerNo }).returning(tankerColumns).get()
}

export function updateTanker(db: Db, id: number, input: TankerInput): Tanker {
  const tankerNo = normalizeName(tankerInputSchema.parse(input).tankerNo)
  assertUnique(listTankers(db), (t) => t.tankerNo, tankerNo, id)
  return found(
    db
      .update(tankers)
      .set({ tankerNo, ...touched })
      .where(eq(tankers.id, id))
      .returning(tankerColumns)
      .get()
  )
}

export function deleteTanker(db: Db, id: number): void {
  deleted(db.delete(tankers).where(eq(tankers.id, id)).run())
}
