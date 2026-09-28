import { mkdirSync } from 'node:fs'
import { release } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, clipboard, dialog, session, shell } from 'electron'
import type { Api } from '@shared/api'
import { closeDb, initDb } from './db'
import { createHandlers, type Handlers } from './handlers'
import { registerIpc } from './ipc'
import { createGate } from './license/gate'
import { readMachineId } from './license/machine-id'
import { createLicenseManager } from './license/manager'
import { licensePublicKey } from './license/public-key'
import { createBackupService } from './services/backup-service'
import { createExportService } from './services/export-dialog'
import { createPrintService } from './services/print'
import { captureMainErrors, createLog, LOGS_FOLDER, type Log } from './log'
import { copyOldUserData, DATA_FOLDER, type DataCopy } from './user-data'
import { APP_TITLE, loadRenderer, lockNavigation, secureWebPreferences } from './windows'

/** Matches `appId` in electron-builder.yml (taskbar grouping, pinned shortcuts). */
const APP_USER_MODEL_ID = 'com.landbl.app'

let mainWindow: BrowserWindow | null = null

/** How often a running app checks the license again (expiry, clock set back). */
const LICENSE_CHECK_EVERY_MS = 60 * 60 * 1000

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: APP_TITLE,
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences
  })
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.on('ready-to-show', () => win.show())

  lockNavigation(win)

  // The renderer blocks unload while a form has unsaved changes; Electron shows no dialog by
  // itself, so ask here and let the window close only if the user confirms.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['الخروج دون حفظ', 'البقاء'],
      defaultId: 1,
      cancelId: 1,
      title: 'تغييرات غير محفوظة',
      message: 'لديك تغييرات غير محفوظة. هل تريد الخروج دون حفظ؟'
    })
    if (choice === 0) event.preventDefault()
  })

  void loadRenderer(win)
}

/**
 * userData is %APPDATA%\land-bl whatever the app's name (user-data.ts), unless a test passes
 * --user-data-dir. On the first start after 1.0.0 the app's files are copied from the old folder.
 * Runs before anything touches userData, including the single-instance lock below.
 */
function setUpUserData(): { ok: true; copy: DataCopy | null } | { ok: false } {
  if (app.commandLine.hasSwitch('user-data-dir')) return { ok: true, copy: null }
  const appData = app.getPath('appData')
  let copy: DataCopy | null
  try {
    copy = copyOldUserData(appData)
  } catch (error) {
    dialog.showErrorBox(
      'تعذّر نسخ بيانات البرنامج',
      `تعذّر نسخ البيانات من المجلد القديم إلى ${join(appData, DATA_FOLDER)}. المجلد القديم لم يتغيّر.\n\n${String(error)}`
    )
    return { ok: false }
  }
  app.setPath('userData', join(appData, DATA_FOLDER))
  return { ok: true, copy }
}

const userData = setUpUserData()
let log: Log

// One instance only: a second copy would open the same SQLite file and userData folder.
if (!userData.ok) {
  app.exit(1)
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  log = createLog({ folder: join(app.getPath('userData'), LOGS_FOLDER) })
  captureMainErrors(log, (message) => dialog.showErrorBox('خطأ غير متوقع', message))
  log.write(
    'INFO',
    `Started ${app.getVersion()} (${app.isPackaged ? 'packaged' : 'dev'}, Electron ${process.versions.electron}, Windows ${release()})`
  )
  if (userData.copy) {
    const { from, to, files } = userData.copy
    log.write('INFO', `Copied data from ${from} to ${to}: ${files.join(', ')}`)
  }
  logProcessErrors(log)

  app.on('second-instance', () => {
    const win = mainWindow
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })
  app.whenReady().then(start)
}

/** Renderer crashes and errors go to the log too: main's console doesn't see them. */
function logProcessErrors(log: Log): void {
  app.on('render-process-gone', (_event, contents, details) =>
    log.write(
      'ERROR',
      `Renderer gone (${details.reason}, exit ${details.exitCode}): ${contents.getURL()}`
    )
  )
  app.on('child-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') {
      log.write(
        'ERROR',
        `${details.type} process gone (${details.reason}, exit ${details.exitCode})`
      )
    }
  })
  app.on('web-contents-created', (_event, contents) => {
    contents.on('console-message', ({ level, message, sourceId, lineNumber }) => {
      if (level === 'error') log.write('ERROR', `Renderer: ${message} (${sourceId}:${lineNumber})`)
    })
    contents.on('preload-error', (_event, path, error) =>
      log.write('ERROR', `Preload ${path}:`, error)
    )
  })
}

/** Version and logs folder, for support. Answered before activation: no database here. */
function appHandlers(): Api['app'] {
  return {
    info: async () => ({
      version: app.getVersion(),
      dataFolder: app.getPath('userData'),
      logsFolder: log.folder
    }),
    openLogsFolder: async () => {
      mkdirSync(log.folder, { recursive: true })
      const error = await shell.openPath(log.folder)
      if (error) throw new Error(`Cannot open ${log.folder}: ${error}`)
    }
  }
}

function start(): void {
  app.setAppUserModelId(APP_USER_MODEL_ID)
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false)
  )

  // The license comes first: until it is valid, the database isn't opened, no backup runs, and
  // every IPC call but `license.*` is refused (license/gate.ts).
  const gate = createGate({
    app: appHandlers(),
    manager: createLicenseManager({
      dir: app.getPath('userData'),
      publicKey: licensePublicKey(),
      readMachineId: () => readMachineId()
    }),
    buildHandlers: openApp,
    copyText: (text) => clipboard.writeText(text),
    // Back to the activation screen.
    onClose: () => {
      if (mainWindow) void loadRenderer(mainWindow)
    }
  })
  registerIpc(gate.dispatch)
  gate.refresh()
  createWindow()
  setInterval(() => gate.refresh(), LICENSE_CHECK_EVERY_MS)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

/** Opens the database and services, and starts the backup schedule. Once, on a valid license. */
function openApp(): Handlers {
  try {
    const db = initDb()
    const backup = createBackupService(db, () => mainWindow)
    const handlers = createHandlers(db, {
      print: createPrintService(db, () => mainWindow),
      export: createExportService(db, () => mainWindow),
      backup
    })
    backup.startSchedule()
    return handlers
  } catch (error) {
    dialog.showErrorBox('تعذّر فتح قاعدة البيانات', String(error))
    app.exit(1)
    throw error
  }
}

app.on('will-quit', () => closeDb())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
