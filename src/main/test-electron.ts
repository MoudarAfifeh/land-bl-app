/**
 * Stand-in for the `electron` module in unit tests (aliased in vitest.config.ts). Outside Electron
 * the real package is just a path string; here any window, dialog or app call fails loudly, so a
 * test proves a service refused *before* opening anything.
 */
const opened = (): never => {
  throw new Error('electron is not available in unit tests')
}

export const app = {
  isPackaged: false,
  getPath: opened,
  getAppPath: opened
}
export const BrowserWindow = opened
export const dialog = { showSaveDialog: opened, showMessageBoxSync: opened }
export const ipcMain = { handle: opened }
