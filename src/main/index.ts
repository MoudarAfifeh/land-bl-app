import { app, BrowserWindow, clipboard, dialog, session } from 'electron'
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
import { loadRenderer, lockNavigation, secureWebPreferences } from './windows'

let mainWindow: BrowserWindow | null = null

/** How often a running app checks the license again (expiry, clock set back). */
const LICENSE_CHECK_EVERY_MS = 60 * 60 * 1000

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
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

// One instance only: a second copy would open the same SQLite file and userData folder.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = mainWindow
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })
  app.whenReady().then(start)
}

function start(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false)
  )

  // The license comes first: until it is valid, the database isn't opened, no backup runs, and
  // every IPC call but `license.*` is refused (license/gate.ts).
  const gate = createGate({
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
