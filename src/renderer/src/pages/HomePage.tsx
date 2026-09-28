import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { BackupStatus, LicenseStatus } from '@shared/api'
import { errorMessages } from '@shared/errors'
import { BackupAgeNotice } from '@/components/BackupAgeNotice'
import { LicenseExpiryNotice } from '@/components/LicenseExpiryNotice'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'

const backupSettings = '/settings?tab=backup'

/** Staff rarely open Settings, so a missing, old or failed backup is announced here too. */
function BackupBanner(): React.JSX.Element | null {
  const [status, setStatus] = useState<BackupStatus | null>(null)

  useEffect(() => {
    // Not being able to read the status must not break the home page.
    window.api.backup.status().then(setStatus, () => undefined)
  }, [])

  if (!status) return null
  if (status.age !== 'ok')
    return (
      <BackupAgeNotice
        status={status}
        action={
          <div>
            <Button asChild size="sm" variant="destructive">
              <Link to={backupSettings}>النسخ الاحتياطي</Link>
            </Button>
          </div>
        }
      />
    )
  if (status.lastError)
    return (
      <Notice tone="warning" data-testid="backup-last-error">
        فشلت آخر محاولة نسخ احتياطي: {errorMessages[status.lastError.code]}{' '}
        <Link to={backupSettings} className="underline">
          الإعدادات
        </Link>
      </Notice>
    )
  return null
}

/** 30 days before the license ends, so it is renewed before the app stops. */
function LicenseBanner(): React.JSX.Element | null {
  const [status, setStatus] = useState<LicenseStatus | null>(null)

  useEffect(() => {
    window.api.license.status().then(setStatus, () => undefined)
  }, [])

  if (!status) return null
  return (
    <LicenseExpiryNotice
      status={status}
      action={
        <div>
          <Button asChild size="sm" variant="outline">
            <Link to="/settings?tab=license">الترخيص</Link>
          </Button>
        </div>
      }
    />
  )
}

function HomePage(): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <h1 className="text-3xl font-bold">وثيقة نقل بري</h1>
      <p className="text-muted-foreground">
        Land Bill of Lading — تطبيق لإصدار وثائق النقل البري وطباعتها وتصديرها إلى Excel و Word.
      </p>
      <div className="flex gap-2">
        <Button asChild>
          <Link to="/new">وثيقة جديدة</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/history">السجل</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/settings">الإعدادات</Link>
        </Button>
      </div>
      <LicenseBanner />
      <BackupBanner />
    </main>
  )
}

export default HomePage
