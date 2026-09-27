import { ipcMain } from 'electron'
import { apiMethods, channelOf } from '@shared/api'
import type { Db } from './db/client'
import { createHandlers, toResult } from './handlers'

/** Registers one ipcMain handler per `window.api` method. */
export function registerIpc(db: Db): void {
  const handlers = createHandlers(db) as unknown as Record<
    string,
    Record<string, (...args: unknown[]) => unknown>
  >
  for (const [group, methods] of Object.entries(apiMethods)) {
    for (const method of methods) {
      const handler = handlers[group][method]
      ipcMain.handle(channelOf(group, method), (_event, ...args: unknown[]) =>
        toResult(() => handler(...args))
      )
    }
  }
}
