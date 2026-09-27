/**
 * The only place serial numbers are generated.
 *
 * Serial = vessel letter + number padded to 5 (A00001). Each vessel has its own counter starting
 * at 1. Numbers are taken inside the transaction that inserts the document, so a failed or
 * abandoned save never burns one, and they are never reused (documents are only soft-deleted).
 */
import { eq, sql } from 'drizzle-orm'
import { SERIAL_DIGITS } from '@shared/fields'
import { ServiceError } from '@shared/errors'
import type { Tx } from '../db/client'
import { counters, vessels } from '../db/schema'

export function formatSerial(prefix: string, number: number): string {
  if (!Number.isInteger(number) || number < 1)
    throw new RangeError(`Invalid serial number ${number}`)
  return `${prefix}${String(number).padStart(SERIAL_DIGITS, '0')}`
}

/**
 * Takes the next number for a vessel. Takes a transaction handle on purpose: the caller must
 * insert the document in the same transaction.
 */
export function takeNextSerial(tx: Tx, vesselId: number): { number: number; serialNo: string } {
  const vessel = tx.select().from(vessels).where(eq(vessels.id, vesselId)).get()
  if (!vessel) throw new ServiceError('VESSEL_NOT_FOUND')
  if (!vessel.isActive) throw new ServiceError('VESSEL_INACTIVE')

  const { lastNumber } = tx
    .insert(counters)
    .values({ vesselId, lastNumber: 1 })
    .onConflictDoUpdate({
      target: counters.vesselId,
      set: { lastNumber: sql`${counters.lastNumber} + 1` }
    })
    .returning({ lastNumber: counters.lastNumber })
    .get()

  return { number: lastNumber, serialNo: formatSerial(vessel.prefix, lastNumber) }
}
