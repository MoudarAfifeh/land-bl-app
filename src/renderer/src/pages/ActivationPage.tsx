import type { LicenseStatus } from '@shared/api'
import { errorMessages } from '@shared/errors'
import { isoToDisplay } from '@/lib/format'
import { LicenseForm, MachineCode } from '@/components/license/LicenseParts'
import { Notice } from '@/components/Notice'

/**
 * The only screen without a valid license: main refuses every other call until then. After
 * activation the app starts from the home page.
 */
function ActivationPage({
  status,
  onActivated
}: {
  status: LicenseStatus
  onActivated: (status: LicenseStatus) => void
}): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8" data-testid="activation-page">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">تفعيل البرنامج</h1>
        <p className="text-muted-foreground">
          يعمل البرنامج بترخيص خاص بهذا الجهاز. أرسل رمز الجهاز إلى المزوّد، ثم الصق الترخيص الذي
          يصلك منه.
        </p>
      </header>

      {status.error && (
        <Notice tone="danger" data-testid="license-status-error">
          <p>{errorMessages[status.error]}</p>
          {status.error === 'LICENSE_EXPIRED' && status.expiresAt && (
            <p className="mt-1">
              ترخيص {status.customerName}، انتهى في{' '}
              <bdi dir="ltr">{isoToDisplay(status.expiresAt)}</bdi>.
            </p>
          )}
        </Notice>
      )}

      {status.machineCode && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">1. رمز هذا الجهاز</h2>
            <MachineCode code={status.machineCode} />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">2. الترخيص</h2>
            <LicenseForm submitLabel="تفعيل" onActivated={onActivated} />
          </section>
        </>
      )}
    </main>
  )
}

export default ActivationPage
