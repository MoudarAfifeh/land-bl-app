/**
 * Contract between preload (`window.api`) and renderer.
 * Each method is one IPC channel `group.method`, one handler in main/handlers.ts.
 */
import type { ErrorCode } from './errors'
import type { Driver, Party, Tanker } from './lookups'
import type { DocumentInput, Settings, VesselInput } from './schemas'

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

/** A saved document as the UI reads it. `vesselId` is kept but never printed. */
export type DocumentView = DocumentInput & { id: number; serialNo: string }

/** The two customs agent blocks printed on every document, from settings. */
export type CustomsAgents = Pick<Settings, 'customsAgent1' | 'customsAgent2'>

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
    /** Any document, including those of inactive vessels. */
    get(id: number): Promise<DocumentView>
  }
  settings: {
    getCustomsAgents(): Promise<CustomsAgents>
  }
  print: {
    /** Opens the system print dialog; `printed` is false if the user cancelled. */
    print(id: number): Promise<{ printed: boolean }>
    /** Asks where to save, then writes the PDF; null if the user cancelled. */
    savePdf(id: number): Promise<{ path: string } | null>
  }
}

export type ApiGroup = keyof Api

/** Every method of the API, used by preload and main to build channels. */
export const apiMethods = {
  vessels: ['listActive', 'getActive', 'create'],
  lookups: ['listParties', 'listDrivers', 'listTankers'],
  documents: ['create', 'get'],
  settings: ['getCustomsAgents'],
  print: ['print', 'savePdf']
} as const satisfies { [G in ApiGroup]: readonly (keyof Api[G])[] }

export function channelOf(group: string, method: string): string {
  return `${group}.${method}`
}

/** What crosses IPC: errors travel as a code because Electron drops custom error fields. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode }

export const API_KEY = 'api'
