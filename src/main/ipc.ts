import { ipcMain } from 'electron'
import { apiMethods, channelOf, type Api } from '@shared/api'
import type { Db } from './db/client'
import { createHandlers, toResultAsync, type AsyncGroup } from './handlers'

/** Registers one ipcMain handler per `window.api` method. */
export function registerIpc(db: Db, services: Pick<Api, AsyncGroup>): void {
  const handlers = createHandlers(db, services) as unknown as Record<
    string,
    Record<string, (...args: unknown[]) => unknown>
  >
  for (const [group, methods] of Object.entries(apiMethods)) {
    for (const method of methods) {
      const handler = handlers[group][method]
      ipcMain.handle(channelOf(group, method), (_event, ...args: unknown[]) =>
        toResultAsync(() => handler(...args))
      )
    }
  }
}
