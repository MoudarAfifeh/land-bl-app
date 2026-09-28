import { useEffect, useState } from 'react'
import type { LicenseStatus } from '@shared/api'
import { errorMessageAr } from '@shared/errors'
import { isoToDisplay } from '@/lib/format'
import { expiryText } from '@/lib/license'
import { LicenseExpiryNotice } from '@/components/LicenseExpiryNotice'
import { LicenseForm, MachineCode } from '@/components/license/LicenseParts'

/** Who the license is for, until when, and a box to paste a renewal. */
export function LicenseTab(): React.JSX.Element {
  const [status, setStatus] = useState<LicenseStatus | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    window.api.license
      .status()
      .then(setStatus, (e: unknown) => setMessage({ ok: false, text: errorMessageAr(e) }))
  }, [])

  return (
    <section className="flex flex-col gap-6">
      {status && <LicenseExpiryNotice status={status} />}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">الترخيص</h2>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">العميل</dt>
          <dd data-testid="license-customer">{status?.customerName}</dd>
          <dt className="text-muted-foreground">تاريخ الإصدار</dt>
          <dd>{status?.issuedAt && <bdi dir="ltr">{isoToDisplay(status.issuedAt)}</bdi>}</dd>
          <dt className="text-muted-foreground">تاريخ الانتهاء</dt>
          <dd data-testid="license-expiry">
            {status && <bdi dir={status.expiresAt ? 'ltr' : undefined}>{expiryText(status)}</bdi>}
          </dd>
        </dl>
        {status?.machineCode && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">رمز هذا الجهاز (يُطلب عند التجديد)</p>
            <MachineCode code={status.machineCode} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t pt-6">
        <h2 className="text-lg font-semibold">تجديد الترخيص</h2>
        <p className="text-sm text-muted-foreground">
          الصق الترخيص الجديد الذي وصلك من المزوّد. إذا كان غير صالح يبقى الترخيص الحالي كما هو.
        </p>
        <LicenseForm
          submitLabel="تحديث الترخيص"
          onActivated={(next) => {
            setStatus(next)
            setMessage({ ok: true, text: 'تم تحديث الترخيص.' })
          }}
        />
        {message && (
          <p
            role={message.ok ? 'status' : 'alert'}
            className={message.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  )
}
