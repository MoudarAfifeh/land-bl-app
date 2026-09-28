import { ipcMain } from 'electron'
import { apiMethods, channelOf } from '@shared/api'
import type { Dispatch } from './license/gate'

/** Registers one ipcMain handler per `window.api` method, each going through the license gate. */
export function registerIpc(dispatch: Dispatch): void {
  for (const [group, methods] of Object.entries(apiMethods)) {
    for (const method of methods) {
      ipcMain.handle(channelOf(group, method), (_event, ...args: unknown[]) =>
        dispatch(group, method, args)
      )
    }
  }
}
