/**
 * Every IPC call goes through here. Until a valid license is stored, only the `license` and `app`
 * groups answer (UNGATED_GROUPS: activation, version, logs folder); everything else is refused with
 * LICENSE_REQUIRED, and the database isn't even opened
 * (the app handlers are built on the first valid license). The renderer's activation screen is only
 * the visible side of this. No Electron, so the tests call it directly.
 */
import { isUngatedGroup, type Api, type IpcResult } from '@shared/api'
import { ServiceError } from '@shared/errors'
import { toResultAsync, type Handlers } from '../handlers'
import type { LicenseManager } from './manager'

export type Dispatch = (
  group: string,
  method: string,
  args: unknown[]
) => Promise<IpcResult<unknown>>

export interface Gate {
  dispatch: Dispatch
  /** Checks the stored license now and opens or closes. Returns whether the app is open. */
  refresh(): boolean
}

export interface GateOptions {
  manager: LicenseManager
  /** Version and logs folder: answered before activation, must not touch the database. */
  app: Api['app']
  /** Opens the database and services; called once, on the first valid license. */
  buildHandlers: () => Handlers
  copyText: (text: string) => void
  /** The license stopped being valid while the app was open (expired, clock set back). */
  onClose: () => void
}

type MethodTable = Record<string, Record<string, (...args: unknown[]) => unknown>>

export function createGate(options: GateOptions): Gate {
  let handlers: Handlers | null = null
  let open = false

  /** Follows a license status: builds the handlers the first time, signals a close. */
  function follow(active: boolean): boolean {
    if (active && !handlers) handlers = options.buildHandlers()
    if (open && !active) {
      open = false
      options.onClose()
    }
    open = active
    return open
  }

  const license: Api['license'] = {
    status: async () => {
      const status = options.manager.check()
      follow(status.active)
      return status
    },
    activate: async (text) => {
      const status = options.manager.activate(text)
      follow(status.active)
      return status
    },
    copyMachineCode: async () => {
      const { machineCode } = options.manager.check()
      if (machineCode) options.copyText(machineCode)
    }
  }

  return {
    refresh: () => follow(options.manager.check().active),

    dispatch: (group, method, args) =>
      toResultAsync(() => {
        let table: MethodTable[string] | undefined
        const ungated: Pick<Api, 'app' | 'license'> = { app: options.app, license }
        if (isUngatedGroup(group)) table = ungated[group] as unknown as MethodTable[string]
        else if (open && handlers) table = (handlers as unknown as MethodTable)[group]
        else throw new ServiceError('LICENSE_REQUIRED')
        const handler = table && Object.hasOwn(table, method) ? table[method] : undefined
        if (typeof handler !== 'function') throw new Error(`Unknown channel ${group}.${method}`)
        return handler(...args)
      })
  }
}
