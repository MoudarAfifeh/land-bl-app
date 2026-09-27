import { Button } from '@/components/ui/button'
import { ActionStatusMessage } from './ActionStatusMessage'
import { fileActions, useFileActions } from './file-actions'

/**
 * "طباعة", "حفظ PDF", "تصدير Excel" and "تصدير Word" for a saved document.
 * Cancelling any of them shows nothing.
 */
export function PrintActions({ documentId }: { documentId: number }): React.JSX.Element {
  const { busy, status, run } = useFileActions()

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        {fileActions.map((b) => (
          <Button
            key={b.action}
            variant="outline"
            disabled={busy !== null}
            onClick={() => void run(b.action, documentId)}
          >
            <b.icon />
            {busy === b.action ? b.busy : b.label}
          </Button>
        ))}
      </div>
      <ActionStatusMessage status={status} />
    </div>
  )
}
