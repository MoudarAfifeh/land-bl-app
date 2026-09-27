import type { ReactNode } from 'react'
import type { BackupStatus } from '@shared/api'
import { formatDateTime } from '@/lib/format'
import { Notice } from './Notice'

/**
 * The clear warning when there is no backup, or the last one is older than 7 days. Nothing when
 * backups are recent. `action` is shown after the text (e.g. a link to Settings).
 */
export function BackupAgeNotice({
  status,
  action
}: {
  status: BackupStatus
  action?: ReactNode
}): React.JSX.Element | null {
  if (status.age === 'ok') return null
  return (
    <Notice tone="danger" data-testid="backup-age-warning" className="flex flex-col gap-2">
      <p className="font-semibold">
        {status.age === 'none' ? (
          'لا توجد أي نسخة احتياطية من البيانات.'
        ) : (
          <>
            آخر نسخة احتياطية قديمة (<bdi dir="ltr">{formatDateTime(status.lastBackupAt!)}</bdi>)،
            أقدم من 7 أيام.
          </>
        )}
      </p>
      <p>إذا تعطّل الجهاز تضيع كل الوثائق. أنشئ نسخة احتياطية الآن، ويفضّل على ذاكرة USB.</p>
      {action}
    </Notice>
  )
}
