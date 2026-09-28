/**
 * Licenses for the e2e tests, signed with the committed test key. `npm run test:e2e` builds with
 * `--mode e2e`, so the app under test trusts that key (see e2e/fixtures/README.md).
 */
import { createPrivateKey } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { encodeLicense, localDay, type LicensePayload } from '../src/main/license/codec'
import { readMachineId } from '../src/main/license/machine-id'
import { LICENSE_FILE } from '../src/main/license/manager'

const testKey = createPrivateKey(readFileSync(join(__dirname, 'fixtures/license-test-private.pem')))

/** This machine's ID, as the app reads it. */
export function machineId(): string {
  const id = readMachineId()
  if (!id) throw new Error('Cannot read the MachineGuid of this machine')
  return id
}

/** A license for this machine, issued today, never expiring unless overridden. */
export function testLicense(over: Partial<LicensePayload> = {}): string {
  return encodeLicense(
    {
      v: 1,
      product: 'land-bl',
      machineId: machineId(),
      customerName: 'E2E Test Office',
      issuedAt: localDay(new Date()),
      expiresAt: null,
      ...over
    },
    testKey
  )
}

/** Activates the app in a userData folder before it is launched. */
export function installTestLicense(userData: string): void {
  writeFileSync(join(userData, LICENSE_FILE), testLicense())
}

/** YYYY-MM-DD, `days` from today. */
export function inDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return localDay(d)
}
