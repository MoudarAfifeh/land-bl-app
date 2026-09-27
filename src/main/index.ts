import { join } from 'node:path'
import { app, BrowserWindow, dialog, session } from 'electron'
import { is } from '@electron-toolkit/utils'
import { closeDb, initDb } from './db'
import { registerIpc } from './ipc'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.on('ready-to-show', () => win.show())

  // Offline app: never open new windows or navigate away from the bundled UI.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())

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

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// One instance only: a second copy would open the same SQLite file and userData folder.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
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
  try {
    registerIpc(initDb())
  } catch (error) {
    dialog.showErrorBox('تعذّر فتح قاعدة البيانات', String(error))
    app.exit(1)
    return
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

app.on('will-quit', () => closeDb())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
