import type { ReactNode } from 'react'
import { LICENSE_WARNING_DAYS, type LicenseStatus } from '@shared/api'
import { isoToDisplay } from '@/lib/format'
import { Notice } from './Notice'

/** Arabic count of days: يوم واحد، يومين، 3 أيام، 11 يومًا. */
function inDays(n: number): string {
  if (n === 1) return 'يوم واحد'
  if (n === 2) return 'يومين'
  return n <= 10 ? `${n} أيام` : `${n} يومًا`
}

/** The license ends within 30 days: say when, so it can be renewed in time. Nothing otherwise. */
export function LicenseExpiryNotice({
  status,
  action
}: {
  status: LicenseStatus
  action?: ReactNode
}): React.JSX.Element | null {
  const { daysLeft, expiresAt } = status
  if (!status.active || daysLeft === null || !expiresAt || daysLeft > LICENSE_WARNING_DAYS)
    return null
  return (
    <Notice tone="warning" data-testid="license-expiry-warning" className="flex flex-col gap-2">
      <p className="font-semibold">
        {daysLeft === 0
          ? 'ينتهي ترخيص البرنامج اليوم'
          : `ينتهي ترخيص البرنامج بعد ${inDays(daysLeft)}`}{' '}
        (<bdi dir="ltr">{isoToDisplay(expiresAt)}</bdi>).
      </p>
      <p>
        تواصل مع المزوّد لتجديده، ثم الصق الترخيص الجديد في الإعدادات. بعد انتهائه يتوقف البرنامج.
      </p>
      {action}
    </Notice>
  )
}
