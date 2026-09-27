/**
 * One handler per `window.api` method. Kept free of Electron so tests can call it directly;
 * ipc.ts registers each one on its channel. Printing, exporting and backups need Electron (windows,
 * dialogs, restarting the app), so those services are passed in.
 */
import { z, ZodError } from 'zod'
import type { Api, IpcResult } from '@shared/api'
import { ServiceError, type ErrorCode } from '@shared/errors'
import type { Db } from './db/client'
import {
  createDocument,
  getDocumentView,
  listDocuments,
  softDeleteDocument
} from './services/documents'
import * as lookups from './services/lookups'
import { getCustomsAgents, setCustomsAgents } from './services/settings'
import {
  createVessel,
  getActiveVessel,
  listVessels,
  listVesselsWithCounts,
  setActiveVessel,
  updateVessel
} from './services/vessels'

/** Groups whose handlers are asynchronous (they drive Electron windows and dialogs). */
export type AsyncGroup = 'print' | 'export' | 'backup'

/** Same signatures as the Api, but synchronous: better-sqlite3 doesn't need promises. */
type Sync<T> = {
  [M in keyof T]: T[M] extends (...args: infer A) => Promise<infer R> ? (...args: A) => R : never
}

export type Handlers = { [G in Exclude<keyof Api, AsyncGroup>]: Sync<Api[G]> } & {
  [G in AsyncGroup]: Api[G]
}

/** A row id from the renderer: documents, vessels, lookup entries. */
const rowId = z.number().int().positive()

export function createHandlers(db: Db, services: Pick<Api, AsyncGroup>): Handlers {
  return {
    vessels: {
      listActive: () => listVessels(db, { activeOnly: true }),
      listAll: () => listVessels(db),
      getActive: () => getActiveVessel(db),
      create: (input, { makeActive }) => createVessel(db, input, { makeActive }),
      listWithCounts: () => listVesselsWithCounts(db),
      update: (id, input) => updateVessel(db, rowId.parse(id), input),
      setActive: (id) => setActiveVessel(db, rowId.parse(id))
    },
    lookups: {
      listParties: () => lookups.listParties(db),
      listDrivers: () => lookups.listDrivers(db),
      listTankers: () => lookups.listTankers(db),
      createParty: (input) => lookups.createParty(db, input),
      updateParty: (id, input) => lookups.updateParty(db, rowId.parse(id), input),
      deleteParty: (id) => lookups.deleteParty(db, rowId.parse(id)),
      createDriver: (input) => lookups.createDriver(db, input),
      updateDriver: (id, input) => lookups.updateDriver(db, rowId.parse(id), input),
      deleteDriver: (id) => lookups.deleteDriver(db, rowId.parse(id)),
      createTanker: (input) => lookups.createTanker(db, input),
      updateTanker: (id, input) => lookups.updateTanker(db, rowId.parse(id), input),
      deleteTanker: (id) => lookups.deleteTanker(db, rowId.parse(id))
    },
    documents: {
      create: (input, options) => {
        const { id, serialNo } = createDocument(db, input, options)
        return { id, serialNo }
      },
      get: (id) => getDocumentView(db, rowId.parse(id)),
      list: (query) => listDocuments(db, query),
      softDelete: (id) => softDeleteDocument(db, rowId.parse(id))
    },
    settings: {
      getCustomsAgents: () => getCustomsAgents(db),
      setCustomsAgents: (input) => setCustomsAgents(db, input)
    },
    print: {
      print: (id) => services.print.print(rowId.parse(id)),
      savePdf: (id) => services.print.savePdf(rowId.parse(id))
    },
    export: {
      excel: (id) => services.export.excel(rowId.parse(id)),
      word: (id) => services.export.word(rowId.parse(id))
    },
    backup: {
      status: () => services.backup.status(),
      chooseFolder: () => services.backup.chooseFolder(),
      runNow: () => services.backup.runNow(),
      pickRestoreFile: () => services.backup.pickRestoreFile(),
      restore: (file) => services.backup.restore(z.string().min(1).parse(file))
    }
  }
}

function errorCode(error: unknown): ErrorCode {
  let code: ErrorCode = 'UNEXPECTED'
  if (error instanceof ServiceError) code = error.code
  else if (error instanceof ZodError) code = 'INVALID_DATA'
  if (code === 'UNEXPECTED') console.error(error)
  return code
}

/** Runs a handler and turns known errors into a code the renderer can show in Arabic. */
export function toResult<T>(run: () => T): IpcResult<T> {
  try {
    return { ok: true, data: run() }
  } catch (error) {
    return { ok: false, code: errorCode(error) }
  }
}

/** Same as `toResult`, for handlers that may return a promise. */
export async function toResultAsync<T>(run: () => T | Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await run() }
  } catch (error) {
    return { ok: false, code: errorCode(error) }
  }
}
