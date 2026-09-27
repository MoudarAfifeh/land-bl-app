/**
 * Contract between preload (`window.api`) and renderer.
 * Each method is one IPC channel `group.method`, one handler in main/handlers.ts.
 */
import type { ErrorCode } from './errors'
import type { Driver, Party, Tanker } from './lookups'
import type { DocumentInput, VesselInput } from './schemas'

export interface VesselSummary {
  id: number
  name: string
  prefix: string
  arrivalDate: string | null
  isActive: boolean
}

export interface CreateDocumentOptions {
  /** Replace the stored address of an existing shipper / consignee with the document's. */
  updateShipperAddress?: boolean
  updateConsigneeAddress?: boolean
  /** Replace the stored passport number of an existing driver with the document's. */
  updateDriverPassport?: boolean
}

export interface Api {
  vessels: {
    listActive(): Promise<VesselSummary[]>
    /** The default vessel for new documents, or null. */
    getActive(): Promise<VesselSummary | null>
    create(input: VesselInput, options: { makeActive: boolean }): Promise<VesselSummary>
  }
  lookups: {
    listParties(): Promise<Party[]>
    listDrivers(): Promise<Driver[]>
    listTankers(): Promise<Tanker[]>
  }
  documents: {
    create(
      input: DocumentInput,
      options: CreateDocumentOptions
    ): Promise<{ id: number; serialNo: string }>
  }
}

export type ApiGroup = keyof Api

/** Every method of the API, used by preload and main to build channels. */
export const apiMethods = {
  vessels: ['listActive', 'getActive', 'create'],
  lookups: ['listParties', 'listDrivers', 'listTankers'],
  documents: ['create']
} as const satisfies { [G in ApiGroup]: readonly (keyof Api[G])[] }

export function channelOf(group: string, method: string): string {
  return `${group}.${method}`
}

/** What crosses IPC: errors travel as a code because Electron drops custom error fields. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode }

export const API_KEY = 'api'
