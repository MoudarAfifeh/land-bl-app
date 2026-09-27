/**
 * Contract between preload (`window.api`) and renderer.
 * Each method is one IPC channel `group.method`, one handler in main/handlers.ts.
 */
import type { ErrorCode } from './errors'
import type { Driver, Party, Tanker } from './lookups'
import type { DocumentInput, DocumentListQuery, Settings, VesselInput } from './schemas'

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

/**
 * A saved document as the UI reads it. `vesselId` is kept but never printed. `deletedAt` is set
 * for a soft-deleted document, which can still be opened but not printed or exported.
 */
export type DocumentView = DocumentInput & {
  id: number
  serialNo: string
  deletedAt: string | null
}

/** One row of the documents history. */
export interface DocumentListRow {
  id: number
  serialNo: string
  issueDate: string
  vesselId: number
  vesselName: string
  vesselActive: boolean
  shipperName: string
  consigneeName: string
  tankerNo: string
  driverName: string
  deletedAt: string | null
}

/** A page of the history, newest first. `page` is clamped to the last page. */
export interface DocumentListPage {
  rows: DocumentListRow[]
  total: number
  page: number
  pageSize: number
}

/** File formats the document exports to, each filled from its template. */
export type ExportFormat = 'excel' | 'word'

/** The two customs agent blocks printed on every document, from settings. */
export type CustomsAgents = Pick<Settings, 'customsAgent1' | 'customsAgent2'>

export interface Api {
  vessels: {
    listActive(): Promise<VesselSummary[]>
    /** Every vessel, inactive ones too (history filter). */
    listAll(): Promise<VesselSummary[]>
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
    /** Any document, including those of inactive vessels and deleted ones. */
    get(id: number): Promise<DocumentView>
    /** The history: search and filters, newest first, one page. */
    list(query: DocumentListQuery): Promise<DocumentListPage>
    /** Soft delete; the serial stays taken. Deleting twice does nothing. */
    softDelete(id: number): Promise<void>
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
  export: {
    /** Asks where to save, then writes the filled Excel template; null if the user cancelled. */
    excel(id: number): Promise<{ path: string } | null>
    /** Same for the Word template. */
    word(id: number): Promise<{ path: string } | null>
  }
}

export type ApiGroup = keyof Api

/** Every method of the API, used by preload and main to build channels. */
export const apiMethods = {
  vessels: ['listActive', 'listAll', 'getActive', 'create'],
  lookups: ['listParties', 'listDrivers', 'listTankers'],
  documents: ['create', 'get', 'list', 'softDelete'],
  settings: ['getCustomsAgents'],
  print: ['print', 'savePdf'],
  export: ['excel', 'word']
} as const satisfies { [G in ApiGroup]: readonly (keyof Api[G])[] }

export function channelOf(group: string, method: string): string {
  return `${group}.${method}`
}

/** What crosses IPC: errors travel as a code because Electron drops custom error fields. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode }

export const API_KEY = 'api'
