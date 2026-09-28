import type { LicenseStatus } from '@shared/api'
import { isoToDisplay } from './format'

/** "31/12/2026", or permanent when the license has no expiry date. */
export function expiryText(status: Pick<LicenseStatus, 'expiresAt'>): string {
  return status.expiresAt ? isoToDisplay(status.expiresAt) : 'دائم (بلا تاريخ انتهاء)'
}
