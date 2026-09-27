import type { ActionStatus } from './file-actions'

/** "تم حفظ الملف: …" or the error of the last action. */
export function ActionStatusMessage({
  status
}: {
  status: ActionStatus
}): React.JSX.Element | null {
  if (!status) return null
  return (
    <p
      role={status.kind === 'error' ? 'alert' : 'status'}
      className={
        status.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
      }
    >
      {status.kind === 'saved' ? (
        <>
          تم حفظ الملف: {/* Paths read left to right inside Arabic text. */}
          <bdi dir="ltr">{status.path}</bdi>
        </>
      ) : (
        status.text
      )}
    </p>
  )
}
