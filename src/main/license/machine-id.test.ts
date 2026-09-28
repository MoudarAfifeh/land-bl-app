import { describe, expect, it } from 'vitest'
import { machineIdFromGuid } from './codec'
import { parseMachineGuid, readMachineId } from './machine-id'

const REG_OUTPUT = [
  '',
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography',
  '    MachineGuid    REG_SZ    91afce1f-3a34-4510-85bd-4cd8ff49892e',
  '',
  ''
].join('\r\n')

describe('machine id', () => {
  it('reads the MachineGuid from `reg query` output', () => {
    expect(parseMachineGuid(REG_OUTPUT)).toBe('91afce1f-3a34-4510-85bd-4cd8ff49892e')
    expect(parseMachineGuid('ERROR: The system was unable to find the specified key')).toBeNull()
  })

  it('hashes the GUID it reads', () => {
    expect(readMachineId(() => REG_OUTPUT)).toBe(
      machineIdFromGuid('91afce1f-3a34-4510-85bd-4cd8ff49892e')
    )
  })

  it('is null when the registry cannot be read', () => {
    expect(
      readMachineId(() => {
        throw new Error('reg failed')
      })
    ).toBeNull()
    expect(readMachineId(() => 'nothing useful')).toBeNull()
  })
})
