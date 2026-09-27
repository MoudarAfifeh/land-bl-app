/**
 * One handler per `window.api` method. Kept free of Electron so tests can call it directly;
 * ipc.ts registers each one on its channel. Printing needs Electron, so it is passed in.
 */
import { z, ZodError } from 'zod'
import type { Api, IpcResult } from '@shared/api'
import { ServiceError, type ErrorCode } from '@shared/errors'
import type { Db } from './db/client'
import { createDocument, getDocumentView } from './services/documents'
import { listDrivers, listParties, listTankers } from './services/lookups'
import { getSetting } from './services/settings'
import { createVessel, getActiveVessel, listVessels } from './services/vessels'

/** Groups whose handlers are asynchronous (they drive Electron windows and dialogs). */
type AsyncGroup = 'print'

/** Same signatures as the Api, but synchronous: better-sqlite3 doesn't need promises. */
type Sync<T> = {
  [M in keyof T]: T[M] extends (...args: infer A) => Promise<infer R> ? (...args: A) => R : never
}

export type Handlers = { [G in Exclude<keyof Api, AsyncGroup>]: Sync<Api[G]> } & {
  [G in AsyncGroup]: Api[G]
}

const documentId = z.number().int().positive()

export function createHandlers(db: Db, services: Pick<Api, AsyncGroup>): Handlers {
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
      },
      get: (id) => getDocumentView(db, documentId.parse(id))
    },
    settings: {
      getCustomsAgents: () => ({
        customsAgent1: getSetting(db, 'customsAgent1'),
        customsAgent2: getSetting(db, 'customsAgent2')
      })
    },
    print: {
      print: (id) => services.print.print(documentId.parse(id)),
      savePdf: (id) => services.print.savePdf(documentId.parse(id))
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
