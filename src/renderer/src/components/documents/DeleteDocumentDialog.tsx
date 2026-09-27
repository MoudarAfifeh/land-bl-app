import { useState } from 'react'
import { errorMessageAr } from '@shared/errors'
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

export interface DeleteTarget {
  id: number
  serialNo: string
}

/**
 * Asks before a soft delete, naming the serial. The dialog stays open until main confirms, and
 * shows the error if it fails.
 */
export function DeleteDocumentDialog({
  target,
  onClose,
  onDeleted
}: {
  target: DeleteTarget | null
  onClose: () => void
  onDeleted: (target: DeleteTarget) => void
}): React.JSX.Element {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm(): Promise<void> {
    if (!target || deleting) return
    setDeleting(true)
    setError(null)
    try {
      await window.api.documents.softDelete(target.id)
      onDeleted(target)
      onClose()
    } catch (e) {
      setError(errorMessageAr(e))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !deleting) {
          setError(null)
          onClose()
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            حذف الوثيقة <bdi dir="ltr">{target?.serialNo}</bdi>؟
          </AlertDialogTitle>
          <AlertDialogDescription>
            تُخفى الوثيقة من السجل ولا يمكن طباعتها أو تصديرها أو نسخها بعد الحذف. يبقى رقمها
            محجوزاً ولا يُعاد استخدامه.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(e) => {
              // Close only once the delete succeeded.
              e.preventDefault()
              void confirm()
            }}
          >
            {deleting ? 'جارٍ الحذف…' : 'حذف'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
