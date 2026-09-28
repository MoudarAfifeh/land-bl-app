import { join } from 'node:path'
import type { BrowserWindow, Session, WebPreferences } from 'electron'
import { is } from '@electron-toolkit/utils'

/** The Arabic product name, as the Start menu shows it (electron-builder.yml). */
export const APP_TITLE = 'وثيقة نقل بري'

/** Same isolation for every window that loads the UI. */
export const secureWebPreferences: WebPreferences = {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  // Chromium would download Hunspell dictionaries; the app stays offline.
  spellcheck: false
}

/** Offline app: never open new windows or navigate away from the bundled UI. */
export function lockNavigation(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
}

/** The bundled UI and what it loads itself (fonts, logo, PDFs being printed). */
const LOCAL_SCHEMES = new Set(['file:', 'data:', 'blob:', 'devtools:'])

/**
 * Offline app: any request that isn't to a bundled file is cancelled before it reaches the
 * network, and reported. Backs up the renderer's CSP and covers main-side requests too. In dev,
 * the Vite dev server (and its hot reload socket) is allowed.
 */
export function blockRemoteRequests(session: Session, onBlocked: (url: string) => void): void {
  const devServer = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
  const devHost = devServer ? new URL(devServer).host : null
  session.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false
    try {
      const url = new URL(details.url)
      allowed =
        LOCAL_SCHEMES.has(url.protocol) ||
        (devHost !== null && url.host === devHost && /^(https?|wss?):$/.test(url.protocol))
    } catch {
      // not a URL: refused
    }
    if (!allowed) onBlocked(details.url)
    callback({ cancel: !allowed })
  })
}

/** Loads the UI at a hash route: the dev server in development, the bundled file otherwise. */
export function loadRenderer(win: BrowserWindow, route = '/'): Promise<void> {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${route}`)
  }
  return win.loadFile(join(__dirname, '../renderer/index.html'), { hash: route })
}
