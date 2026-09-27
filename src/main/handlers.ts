/**
 * One handler per `window.api` method. Kept free of Electron so tests can call it directly;
 * ipc.ts registers each one on its channel.
 */
import { ZodError } from 'zod'
import type { Api, IpcResult } from '@shared/api'
import { ServiceError, type ErrorCode } from '@shared/errors'
import type { Db } from './db/client'
import { createDocument } from './services/documents'
import { listDrivers, listParties, listTankers } from './services/lookups'
import { createVessel, getActiveVessel, listVessels } from './services/vessels'

/** Same signatures as the Api, but synchronous: better-sqlite3 doesn't need promises. */
export type Handlers = {
  [G in keyof Api]: {
    [M in keyof Api[G]]: Api[G][M] extends (...args: infer A) => Promise<infer R>
      ? (...args: A) => R
      : never
  }
}

export function createHandlers(db: Db): Handlers {
  return {
    vessels: {
      listActive: () => listVessels(db, { activeOnly: true }),
      getActive: () => getActiveVessel(db),
      create: (input, { makeActive }) => createVessel(db, input, { makeActive })
    },
    lookups: {
      listParties: () => listParties(db),
      listDrivers: () => listDrivers(db),
      listTankers: () => listTankers(db)
    },
    documents: {
      create: (input, options) => {
        const { id, serialNo } = createDocument(db, input, options)
        return { id, serialNo }
      }
    }
  }
}

/** Runs a handler and turns known errors into a code the renderer can show in Arabic. */
export function toResult<T>(run: () => T): IpcResult<T> {
  try {
    return { ok: true, data: run() }
  } catch (error) {
    let code: ErrorCode = 'UNEXPECTED'
    if (error instanceof ServiceError) code = error.code
    else if (error instanceof ZodError) code = 'INVALID_DATA'
    if (code === 'UNEXPECTED') console.error(error)
    return { ok: false, code }
  }
}
