import { useCallback, useEffect, useState } from 'react'
import { DatabaseBackup, FolderOpen, History } from 'lucide-react'
import type { BackupStatus, RestorePreview } from '@shared/api'
import { errorMessageAr, errorMessages } from '@shared/errors'
import { formatDateTime } from '@/lib/format'
import { BackupAgeNotice } from '@/components/BackupAgeNotice'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { RestoreDialog } from './RestoreDialog'

type Busy = 'backup' | 'folder' | 'pick' | null

/** A path, always left to right. */
function PathText({ path }: { path: string }): React.JSX.Element {
  return (
    <bdi dir="ltr" className="font-mono text-xs break-all">
      {path}
    </bdi>
  )
}

/** Backup folder, last backup, "back up now" and restore. */
export function BackupTab(): React.JSX.Element {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [preview, setPreview] = useState<RestorePreview | null>(null)

  const load = useCallback(() => {
    window.api.backup
      .status()
      .then(setStatus, (e: unknown) => setMessage({ ok: false, text: errorMessageAr(e) }))
  }, [])
  useEffect(load, [load])

  async function run(kind: Exclude<Busy, null>, action: () => Promise<void>): Promise<void> {
    setBusy(kind)
    setMessage(null)
    try {
      await action()
    } catch (e) {
      setMessage({ ok: false, text: errorMessageAr(e) })
      load() // a failed backup is recorded in the status
    } finally {
      setBusy(null)
    }
  }

  const backUpNow = (): Promise<void> =>
    run('backup', async () => {
      const next = await window.api.backup.runNow()
      setStatus(next)
      setMessage({ ok: true, text: 'تم إنشاء النسخة الاحتياطية.' })
    })

  const chooseFolder = (): Promise<void> =>
    run('folder', async () => {
      const next = await window.api.backup.chooseFolder()
      if (next) setStatus(next)
    })

  const pickRestore = (): Promise<void> =>
    run('pick', async () => {
      const next = await window.api.backup.pickRestoreFile()
      if (next) setPreview(next)
    })

  return (
    <section className="flex flex-col gap-6">
      {status && <BackupAgeNotice status={status} />}
      {status?.lastError && (
        <Notice tone="warning" data-testid="backup-last-error">
          فشلت آخر محاولة نسخ احتياطي بتاريخ{' '}
          <bdi dir="ltr">{formatDateTime(status.lastError.at)}</bdi>:{' '}
          {errorMessages[status.lastError.code]}
        </Notice>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">النسخ الاحتياطي</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">آخر نسخة</dt>
          <dd data-testid="backup-last">
            {status?.lastBackupAt ? (
              <bdi dir="ltr">{formatDateTime(status.lastBackupAt)}</bdi>
            ) : (
              'لا توجد'
            )}
          </dd>
          {status?.lastBackupPath && (
            <>
              <dt className="text-muted-foreground">ملف آخر نسخة</dt>
              <dd>
                <PathText path={status.lastBackupPath} />
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">المجلد</dt>
          <dd data-testid="backup-folder">{status && <PathText path={status.folder} />}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void backUpNow()} disabled={busy !== null || !status}>
            <DatabaseBackup />
            {busy === 'backup' ? 'جارٍ النسخ…' : 'نسخ احتياطي الآن'}
          </Button>
          <Button variant="outline" onClick={() => void chooseFolder()} disabled={busy !== null}>
            <FolderOpen />
            تغيير المجلد
          </Button>
        </div>
        {message && (
          <p
            role={message.ok ? 'status' : 'alert'}
            className={message.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}
          >
            {message.text}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          تُنشأ نسخة تلقائياً عند تشغيل البرنامج إذا مرّ يوم على آخر نسخة، ويُحتفظ بآخر 30 نسخة في
          المجلد.
        </p>
        {status && (
          <Notice tone={status.sameDriveAsData ? 'warning' : 'info'}>
            {status.sameDriveAsData
              ? 'مجلد النسخ على نفس القرص الذي يحفظ عليه البرنامج بياناته: إذا تعطّل القرص تضيع البيانات والنسخ معاً. '
              : ''}
            يُنصح بأن يكون مجلد النسخ الاحتياطي على ذاكرة USB أو قرص آخر.
          </Notice>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t pt-6">
        <h2 className="text-lg font-semibold">الاستعادة</h2>
        <p className="text-sm text-muted-foreground">
          تستبدل الاستعادة كل البيانات الحالية بمحتوى النسخة المختارة. قبل ذلك تُحفظ نسخة أمان من
          البيانات الحالية في مجلد النسخ، ثم يُعاد تشغيل البرنامج.
        </p>
        <div>
          <Button variant="outline" onClick={() => void pickRestore()} disabled={busy !== null}>
            <History />
            {busy === 'pick' ? 'جارٍ فحص الملف…' : 'استعادة من نسخة احتياطية…'}
          </Button>
        </div>
      </div>

      {preview && <RestoreDialog preview={preview} onClose={() => setPreview(null)} />}
    </section>
  )
}
