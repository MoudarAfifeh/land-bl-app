import { asc, eq } from 'drizzle-orm'
import { ServiceError } from '@shared/errors'
import { vesselInputSchema, type VesselInput } from '@shared/schemas'
import type { Db } from '../db/client'
import { documents, vessels, type Vessel } from '../db/schema'
import { getSetting, setSetting } from './settings'

export function createVessel(
  db: Db,
  input: VesselInput,
  { makeActive = false }: { makeActive?: boolean } = {}
): Vessel {
  const data = vesselInputSchema.parse(input)
  return db.transaction((tx) => {
    const vessel = tx.insert(vessels).values(data).returning().get()
    if (makeActive) {
      if (!vessel.isActive) throw new ServiceError('VESSEL_INACTIVE')
      setSetting(tx, 'activeVesselId', vessel.id)
    }
    return vessel
  })
}

export function listVessels(
  db: Db,
  { activeOnly = false }: { activeOnly?: boolean } = {}
): Vessel[] {
  const query = db.select().from(vessels)
  return (activeOnly ? query.where(eq(vessels.isActive, true)) : query)
    .orderBy(asc(vessels.id))
    .all()
}

/** The default vessel for new documents, or null if none is set or it was deactivated. */
export function getActiveVessel(db: Db): Vessel | null {
  const id = getSetting(db, 'activeVesselId')
  if (id === null) return null
  const vessel = db.select().from(vessels).where(eq(vessels.id, id)).get()
  return vessel?.isActive ? vessel : null
}

export function setActiveVessel(db: Db, id: number): void {
  const vessel = db.select().from(vessels).where(eq(vessels.id, id)).get()
  if (!vessel) throw new ServiceError('VESSEL_NOT_FOUND')
  if (!vessel.isActive) throw new ServiceError('VESSEL_INACTIVE')
  setSetting(db, 'activeVesselId', id)
}

/**
 * Updates a vessel. The letter can't change once documents exist, so issued serials keep their
 * meaning. Deactivating the active vessel clears the default.
 */
export function updateVessel(db: Db, id: number, patch: Partial<VesselInput>): Vessel {
  return db.transaction((tx) => {
    const current = tx.select().from(vessels).where(eq(vessels.id, id)).get()
    if (!current) throw new ServiceError('VESSEL_NOT_FOUND')

    const data = vesselInputSchema.parse({ ...current, ...patch })
    if (data.prefix !== current.prefix) {
      const hasDocuments = tx
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.vesselId, id))
        .limit(1)
        .get()
      if (hasDocuments) throw new ServiceError('PREFIX_LOCKED')
    }

    const updated = tx.update(vessels).set(data).where(eq(vessels.id, id)).returning().get()
    if (!updated.isActive && getSetting(tx, 'activeVesselId') === id)
      setSetting(tx, 'activeVesselId', null)
    return updated
  })
}
