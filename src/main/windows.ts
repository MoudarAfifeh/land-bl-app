import { join } from 'node:path'
import type { BrowserWindow, WebPreferences } from 'electron'
import { is } from '@electron-toolkit/utils'

/** The Arabic product name, as the Start menu shows it (electron-builder.yml). */
export const APP_TITLE = 'وثيقة نقل بري'

/** Same isolation for every window that loads the UI. */
export const secureWebPreferences: WebPreferences = {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
}

/** Offline app: never open new windows or navigate away from the bundled UI. */
export function lockNavigation(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
}

/** Loads the UI at a hash route: the dev server in development, the bundled file otherwise. */
export function loadRenderer(win: BrowserWindow, route = '/'): Promise<void> {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${route}`)
  }
  return win.loadFile(join(__dirname, '../renderer/index.html'), { hash: route })
}
