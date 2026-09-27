/**
 * Drizzle schema. Document columns are the snake_case of the keys in src/shared/fields.ts;
 * schema.test.ts fails if the two drift apart.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core'

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

const timestamps = {
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now)
}

/** A vessel (الباخرة). Its letter prefixes the serial of every document issued for it. */
export const vessels = sqliteTable(
  'vessels',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    // Not unique: a letter may be reused for a later vessel (open question in CLAUDE.md).
    prefix: text('prefix').notNull(),
    arrivalDate: text('arrival_date'),
    // Inactive vessels can't receive new documents; their existing documents stay usable.
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(now)
  },
  (t) => [check('vessels_prefix_letter', sql`${t.prefix} GLOB '[A-Z]' AND length(${t.prefix}) = 1`)]
)

/** Last serial number used per vessel. Only services/serial.ts writes here. */
export const counters = sqliteTable('counters', {
  vesselId: integer('vessel_id')
    .primaryKey()
    .references(() => vessels.id),
  lastNumber: integer('last_number').notNull().default(0)
})

export const documents = sqliteTable(
  'documents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    vesselId: integer('vessel_id')
      .notNull()
      .references(() => vessels.id),
    number: integer('number').notNull(),
    // Serial as issued (prefix + padded number). Not unique on its own: two vessels may share a letter.
    serialNo: text('serial_no').notNull(),

    issueDate: text('issue_date').notNull(),
    shipperName: text('shipper_name').notNull(),
    shipperAddress: text('shipper_address'),
    consigneeName: text('consignee_name').notNull(),
    consigneeAddress: text('consignee_address'),

    product: text('product'),
    qtyNaturalL: real('qty_natural_l'),
    qtyStandardL: real('qty_standard_l'),
    weightKg: real('weight_kg'),
    barrels: real('barrels'),
    seals: text('seals', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),

    density15: real('density15'),
    octane: real('octane'),
    flashPoint: real('flash_point'),
    temperature: real('temperature'),
    vcf: real('vcf'),
    meterFactor: real('meter_factor'),
    crossingNo: text('crossing_no'),
    supplyOfficerName: text('supply_officer_name'),
    supplyOfficerTitle: text('supply_officer_title'),

    missionNo: text('mission_no'),
    supplyOrderNo: text('supply_order_no'),
    supplyOrderDate: text('supply_order_date'),
    tankerNo: text('tanker_no').notNull(),
    driverName: text('driver_name').notNull(),
    passportNo: text('passport_no'),
    carrierRep: text('carrier_rep'),
    transportDate: text('transport_date'),

    ...timestamps,
    deletedAt: text('deleted_at')
  },
  (t) => [
    uniqueIndex('documents_vessel_number_unique').on(t.vesselId, t.number),
    index('documents_serial_no_idx').on(t.serialNo),
    index('documents_issue_date_idx').on(t.issueDate),
    check('documents_number_positive', sql`${t.number} >= 1`)
  ]
)

export const parties = sqliteTable('parties', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  address: text('address'),
  ...timestamps
})

export const drivers = sqliteTable('drivers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  passportNo: text('passport_no'),
  ...timestamps
})

export const tankers = sqliteTable('tankers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tankerNo: text('tanker_no').notNull().unique(),
  ...timestamps
})

/** Key/value settings; keys come from settingFields, values are JSON. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }),
  updatedAt: text('updated_at').notNull().default(now)
})

export type Vessel = typeof vessels.$inferSelect
export type DocumentRow = typeof documents.$inferSelect
