/**
 * This PC's ID for the license: the Windows MachineGuid (set when Windows is installed), hashed
 * with an app salt (codec.ts). Read with `reg query`, which ships with Windows: no dependency.
 */
import { execFileSync } from 'node:child_process'
import { machineIdFromGuid } from './codec'

const GUID = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/

/** The GUID in `reg query` output, or null. */
export function parseMachineGuid(output: string): string | null {
  return GUID.exec(output)?.[1] ?? null
}

/** The 64-bit registry view, whatever the process architecture. */
function queryRegistry(): string {
  return execFileSync(
    'reg',
    ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'],
    { encoding: 'utf8', windowsHide: true, timeout: 10_000 }
  )
}

/** The machine ID, or null if the MachineGuid can't be read. */
export function readMachineId(query: () => string = queryRegistry): string | null {
  try {
    const guid = parseMachineGuid(query())
    return guid ? machineIdFromGuid(guid) : null
  } catch {
    return null
  }
}
