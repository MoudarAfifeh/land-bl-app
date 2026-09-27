import { app, BrowserWindow, dialog, session } from 'electron'
import { closeDb, initDb } from './db'
import { registerIpc } from './ipc'
import { createBackupService, type BackupService } from './services/backup-service'
import { createExportService } from './services/export-dialog'
import { createPrintService } from './services/print'
import { loadRenderer, lockNavigation, secureWebPreferences } from './windows'

let mainWindow: BrowserWindow | null = null

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
  let backup: BackupService
  try {
    const db = initDb()
    backup = createBackupService(db, () => mainWindow)
    registerIpc(db, {
      print: createPrintService(db, () => mainWindow),
      export: createExportService(db, () => mainWindow),
      backup
    })
  } catch (error) {
    dialog.showErrorBox('تعذّر فتح قاعدة البيانات', String(error))
    app.exit(1)
    return
  }
  createWindow()
  backup.startSchedule()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

app.on('will-quit', () => closeDb())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
