import { useRef, useState } from 'react'
import { FileDown, FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { errorMessageAr } from '@shared/errors'
import { Button } from '@/components/ui/button'

type Status = { kind: 'saved'; path: string } | { kind: 'error'; text: string } | null
type Action = 'print' | 'pdf' | 'excel' | 'word'

/** Runs an action; resolves with the saved file's path, or null (printed, or cancelled). */
function perform(action: Action, id: number): Promise<{ path: string } | null> {
  switch (action) {
    case 'print':
      return window.api.print.print(id).then(() => null)
    case 'pdf':
      return window.api.print.savePdf(id)
    case 'excel':
      return window.api.export.excel(id)
    case 'word':
      return window.api.export.word(id)
  }
}

const buttons: { action: Action; icon: React.JSX.Element; label: string; busy: string }[] = [
  { action: 'print', icon: <Printer />, label: 'طباعة', busy: 'جارٍ التحضير…' },
  { action: 'pdf', icon: <FileDown />, label: 'حفظ PDF', busy: 'جارٍ الحفظ…' },
  { action: 'excel', icon: <FileSpreadsheet />, label: 'تصدير Excel', busy: 'جارٍ التصدير…' },
  { action: 'word', icon: <FileText />, label: 'تصدير Word', busy: 'جارٍ التصدير…' }
]

/**
 * "طباعة", "حفظ PDF", "تصدير Excel" and "تصدير Word" for a saved document.
 * Cancelling any of them shows nothing.
 */
export function PrintActions({ documentId }: { documentId: number }): React.JSX.Element {
  const [busy, setBusy] = useState<Action | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const busyRef = useRef(false)

  async function run(action: Action): Promise<void> {
    // One job at a time: each opens a system dialog (and printing a hidden window).
    if (busyRef.current) return
    busyRef.current = true
    setBusy(action)
    setStatus(null)
    try {
      const saved = await perform(action, documentId)
      if (saved) setStatus({ kind: 'saved', path: saved.path })
    } catch (e) {
      setStatus({ kind: 'error', text: errorMessageAr(e) })
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        {buttons.map((b) => (
          <Button
            key={b.action}
            variant="outline"
            disabled={busy !== null}
            onClick={() => void run(b.action)}
          >
            {b.icon}
            {busy === b.action ? b.busy : b.label}
          </Button>
        ))}
      </div>
      {status && (
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
      )}
    </div>
  )
}
