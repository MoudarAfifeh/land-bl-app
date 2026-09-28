import { createPublicKey, type KeyObject } from 'node:crypto'

/**
 * The license public key (SPKI DER, base64), compiled in by electron.vite.config.ts: the
 * production key, or the test key in an e2e build. Only the public key is ever in the app.
 */
declare const __LICENSE_PUBLIC_KEY__: string

export function licensePublicKey(): KeyObject {
  return createPublicKey({
    key: Buffer.from(__LICENSE_PUBLIC_KEY__, 'base64'),
    format: 'der',
    type: 'spki'
  })
}
