import { contextBridge, ipcRenderer } from 'electron'
import { API_KEY, apiMethods, channelOf, type Api, type IpcResult } from '@shared/api'

/**
 * Builds `window.api` from the method list. A failed call rejects with an Error whose message is
 * the error code; the renderer turns it into Arabic with `errorMessageAr`.
 */
async function call(channel: string, args: unknown[]): Promise<unknown> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<unknown>
  if (!result.ok) throw new Error(result.code)
  return result.data
}

const api = Object.fromEntries(
  Object.entries(apiMethods).map(([group, methods]) => [
    group,
    Object.fromEntries(
      methods.map((method) => [
        method,
        (...args: unknown[]) => call(channelOf(group, method), args)
      ])
    )
  ])
) as unknown as Api

contextBridge.exposeInMainWorld(API_KEY, api)
