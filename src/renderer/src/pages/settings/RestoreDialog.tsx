import { useState } from 'react'
import type { RestorePreview } from '@shared/api'
import { errorMessageAr } from '@shared/errors'
import { formatDateTime } from '@/lib/format'
import { Notice } from '@/components/Notice'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'

const Serial = ({ value }: { value: string }): React.JSX.Element => <bdi dir="ltr">{value}</bdi>

/**
 * What the backup holds and what restoring it changes, then the confirmation. Main checks the file
 * again before restoring; on success the app restarts.
 */
export function RestoreDialog({
  preview,
  onClose
}: {
  preview: RestorePreview
  onClose: () => void
}): React.JSX.Element {
  const [restoring, setRestoring] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function restore(): Promise<void> {
    setRestoring(true)
    setError(null)
    try {
      await window.api.backup.restore(preview.file)
      setDone(true) // the app is about to restart
    } catch (e) {
      setError(errorMessageAr(e))
      setRestoring(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && !restoring && onClose()}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>استعادة النسخة الاحتياطية؟</AlertDialogTitle>
          <AlertDialogDescription>
            ستُستبدل كل البيانات الحالية بمحتوى هذه النسخة، ثم يُعاد تشغيل البرنامج.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <dl
          data-testid="restore-summary"
          className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm"
        >
          <dt className="text-muted-foreground">الملف</dt>
          <dd>
            <bdi dir="ltr" className="font-mono text-xs break-all">
              {preview.file}
            </bdi>
          </dd>
          <dt className="text-muted-foreground">تاريخ النسخة</dt>
          <dd>
            <bdi dir="ltr">{formatDateTime(preview.fileDate)}</bdi>
          </dd>
          <dt className="text-muted-foreground">عدد الوثائق</dt>
          <dd>
            {preview.documentCount}
            {preview.deletedCount > 0 && ` (منها ${preview.deletedCount} محذوفة)`}
          </dd>
          <dt className="text-muted-foreground">آخر رقم صادر</dt>
          <dd>{preview.newestSerial ? <Serial value={preview.newestSerial} /> : '—'}</dd>
        </dl>

        {preview.removedDocuments > 0 && (
          <Notice tone="danger" data-testid="restore-removed">
            ستُزال {preview.removedDocuments} وثيقة حُفظت بعد هذه النسخة. تبقى في نسخة الأمان التي
            تُنشأ قبل الاستعادة.
          </Notice>
        )}

        {preview.lostVessels.length > 0 && (
          <Notice tone="warning" data-testid="restore-lost-vessels">
            <p className="font-semibold">بواخر أُضيفت بعد هذه النسخة ستختفي:</p>
            <ul className="my-1 list-disc ps-5">
              {preview.lostVessels.map((v) => (
                <li key={`${v.name}-${v.prefix}`}>
                  {v.name} (<bdi dir="ltr">{v.prefix}</bdi>) —{' '}
                  {v.lastSerial ? (
                    <>
                      آخر رقم صادر <Serial value={v.lastSerial} />
                    </>
                  ) : (
                    'لم تصدر لها وثائق'
                  )}
                </li>
              ))}
            </ul>
            <p>
              أرقام هذه البواخر طُبعت على وثائق. إذا أضفتها من جديد فستبدأ أرقامها من 1 وقد تتكرر
              أرقام مطبوعة.
            </p>
          </Notice>
        )}

        {preview.vessels.length > 0 && (
          <div className="flex flex-col gap-1 text-sm" data-testid="restore-next-serials">
            <p className="font-semibold">يستمر الترقيم بعد الاستعادة:</p>
            <ul className="list-disc ps-5">
              {preview.vessels.map((v) => (
                <li key={`${v.name}-${v.prefix}`}>
                  {v.name}: الرقم التالي <Serial value={v.nextSerial} />
                  {v.keptHigher && ' (يُحتفظ بالعدّاد الحالي لأن أرقاماً بعد النسخة صدرت فعلاً)'}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="text-sm">
            تمت الاستعادة. يُعاد تشغيل البرنامج…
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={restoring}>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={restoring}
            onClick={(e) => {
              e.preventDefault()
              void restore()
            }}
          >
            {restoring ? 'جارٍ الاستعادة…' : 'استعادة وإعادة التشغيل'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
