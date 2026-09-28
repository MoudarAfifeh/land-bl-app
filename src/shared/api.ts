/**
 * Contract between preload (`window.api`) and renderer.
 * Each method is one IPC channel `group.method`, one handler in main/handlers.ts.
 */
import type { ErrorCode } from './errors'
import type { Driver, Party, Tanker } from './lookups'
import type {
  DocumentInput,
  DocumentListQuery,
  DriverInput,
  PartyInput,
  Settings,
  TankerInput,
  VesselInput
} from './schemas'

export interface VesselSummary {
  id: number
  name: string
  prefix: string
  arrivalDate: string | null
  isActive: boolean
}

/** A vessel in the settings list. Its letter is locked once `documentCount` > 0. */
export interface VesselListRow extends VesselSummary {
  /** The default vessel for new documents. */
  isCurrent: boolean
  /** Deleted documents included: their numbers stay taken. */
  documentCount: number
  /** Serial of the highest number issued, or null. */
  lastSerial: string | null
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
 * for a soft-deleted document, which can still be opened but not printed or exported. The agent
 * blocks are the document's own copy, taken from settings when it was saved.
 */
export type DocumentView = DocumentInput &
  CustomsAgents & {
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

/** How old the last backup is: none yet, recent enough, or older than 7 days. */
export type BackupAge = 'none' | 'ok' | 'stale'

export interface BackupStatus {
  folder: string
  /** ISO time of the last successful backup, automatic or manual. */
  lastBackupAt: string | null
  lastBackupPath: string | null
  /** The last backup attempt failed (e.g. USB drive unplugged); cleared by the next success. */
  lastError: { at: string; code: ErrorCode } | null
  age: BackupAge
  /** The folder is on the same drive as the app's data, so one disk failure loses both. */
  sameDriveAsData: boolean
}

/** What restoring a backup file would do, shown before the user confirms. */
export interface RestorePreview {
  file: string
  /** ISO time the file was last written. */
  fileDate: string
  documentCount: number
  deletedCount: number
  /** Serial of the last document issued in the backup. */
  newestSerial: string | null
  /** Where numbering continues, per vessel (active ones, and any whose counter is kept higher). */
  vessels: { name: string; prefix: string; nextSerial: string; keptHigher: boolean }[]
  /** Documents in the current data that the backup doesn't have: they will be removed. */
  removedDocuments: number
  /** Vessels created after the backup: they disappear, but their serials were already issued. */
  lostVessels: { name: string; prefix: string; lastSerial: string | null }[]
}

/** The home page warns this many days (or fewer) before the license expires. */
export const LICENSE_WARNING_DAYS = 30

/**
 * The license as the activation screen and Settings show it. Without an active license, main
 * refuses every other call with LICENSE_REQUIRED.
 */
export interface LicenseStatus {
  active: boolean
  /** Why it isn't active; null when active, or when no license was ever entered. */
  error: ErrorCode | null
  /** This PC's code (7F3A-92C1-0B4E-D8A5) to send for a license; null if it can't be read. */
  machineCode: string | null
  /** From the stored license (also shown when it expired), otherwise null. */
  customerName: string | null
  issuedAt: string | null
  /** Null: never expires. */
  expiresAt: string | null
  /** Whole days to the expiry date, 0 on the last day; null without an expiry. */
  daysLeft: number | null
}

/** Shown in Settings and on the activation screen, for support. */
export interface AppInfo {
  version: string
  /** userData: database, license, backup settings. */
  dataFolder: string
  logsFolder: string
}

export interface Api {
  /** Answered before activation too (license/gate.ts): nothing here opens the database. */
  app: {
    info(): Promise<AppInfo>
    /** Opens the logs folder in Explorer, so the client can send the log files. */
    openLogsFolder(): Promise<void>
  }
  license: {
    /** Checks the stored license again (expiry, clock) and returns it. */
    status(): Promise<LicenseStatus>
    /**
     * Verifies a pasted license and stores it (also to renew). A refused one leaves the stored
     * license unchanged and rejects with its error code.
     */
    activate(text: string): Promise<LicenseStatus>
    /** Copies the machine code to the clipboard. */
    copyMachineCode(): Promise<void>
  }
  vessels: {
    listActive(): Promise<VesselSummary[]>
    /** Every vessel, inactive ones too (history filter). */
    listAll(): Promise<VesselSummary[]>
    /** The default vessel for new documents, or null. */
    getActive(): Promise<VesselSummary | null>
    create(input: VesselInput, options: { makeActive: boolean }): Promise<VesselSummary>
    /** Settings list: document counts, current vessel. */
    listWithCounts(): Promise<VesselListRow[]>
    /** Name, arrival date, active; the letter only while the vessel has no documents. */
    update(id: number, input: VesselInput): Promise<VesselSummary>
    /** Makes an active vessel the default for new documents. */
    setActive(id: number): Promise<void>
  }
  lookups: {
    listParties(): Promise<Party[]>
    listDrivers(): Promise<Driver[]>
    listTankers(): Promise<Tanker[]>
    /** Settings. LOOKUP_DUPLICATE for an exact duplicate; saved documents never change. */
    createParty(input: PartyInput): Promise<Party>
    updateParty(id: number, input: PartyInput): Promise<Party>
    deleteParty(id: number): Promise<void>
    createDriver(input: DriverInput): Promise<Driver>
    updateDriver(id: number, input: DriverInput): Promise<Driver>
    deleteDriver(id: number): Promise<void>
    createTanker(input: TankerInput): Promise<Tanker>
    updateTanker(id: number, input: TankerInput): Promise<Tanker>
    deleteTanker(id: number): Promise<void>
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
    /** Applies to documents saved afterwards; saved ones keep their copy. */
    setCustomsAgents(input: CustomsAgents): Promise<CustomsAgents>
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
  backup: {
    status(): Promise<BackupStatus>
    /** Asks for a folder; null if the user cancelled. */
    chooseFolder(): Promise<BackupStatus | null>
    /** Backs up now into the chosen folder. */
    runNow(): Promise<BackupStatus>
    /** Asks for a backup file and checks it; null if the user cancelled. */
    pickRestoreFile(): Promise<RestorePreview | null>
    /** Checks the file again, writes a safety backup, restores and restarts the app. */
    restore(file: string): Promise<void>
  }
}

export type ApiGroup = keyof Api

/**
 * Groups the license gate answers before activation. Everything else is refused with
 * LICENSE_REQUIRED and the database stays closed.
 */
export const UNGATED_GROUPS = ['app', 'license'] as const satisfies readonly ApiGroup[]
export type UngatedGroup = (typeof UNGATED_GROUPS)[number]

export function isUngatedGroup(group: string): group is UngatedGroup {
  return (UNGATED_GROUPS as readonly string[]).includes(group)
}

/** Every method of the API, used by preload and main to build channels. */
export const apiMethods = {
  app: ['info', 'openLogsFolder'],
  license: ['status', 'activate', 'copyMachineCode'],
  vessels: [
    'listActive',
    'listAll',
    'getActive',
    'create',
    'listWithCounts',
    'update',
    'setActive'
  ],
  lookups: [
    'listParties',
    'listDrivers',
    'listTankers',
    'createParty',
    'updateParty',
    'deleteParty',
    'createDriver',
    'updateDriver',
    'deleteDriver',
    'createTanker',
    'updateTanker',
    'deleteTanker'
  ],
  documents: ['create', 'get', 'list', 'softDelete'],
  settings: ['getCustomsAgents', 'setCustomsAgents'],
  print: ['print', 'savePdf'],
  export: ['excel', 'word'],
  backup: ['status', 'chooseFolder', 'runNow', 'pickRestoreFile', 'restore']
} as const satisfies { [G in ApiGroup]: readonly (keyof Api[G])[] }

export function channelOf(group: string, method: string): string {
  return `${group}.${method}`
}

/** What crosses IPC: errors travel as a code because Electron drops custom error fields. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode }

export const API_KEY = 'api'
