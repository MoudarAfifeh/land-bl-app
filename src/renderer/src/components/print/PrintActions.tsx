import { useRef, useState } from 'react'
import { FileDown, Printer } from 'lucide-react'
import { errorMessageAr } from '@shared/errors'
import { Button } from '@/components/ui/button'

type Status = { kind: 'saved'; path: string } | { kind: 'error'; text: string } | null

/** "طباعة" and "حفظ PDF" for a saved document. Cancelling either shows nothing. */
export function PrintActions({ documentId }: { documentId: number }): React.JSX.Element {
  const [busy, setBusy] = useState<'print' | 'pdf' | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const busyRef = useRef(false)

  async function run(kind: 'print' | 'pdf'): Promise<void> {
    // One job at a time: each opens a hidden window and a system dialog.
    if (busyRef.current) return
    busyRef.current = true
    setBusy(kind)
    setStatus(null)
    try {
      if (kind === 'print') {
        await window.api.print.print(documentId)
      } else {
        const saved = await window.api.print.savePdf(documentId)
        if (saved) setStatus({ kind: 'saved', path: saved.path })
      }
    } catch (e) {
      setStatus({ kind: 'error', text: errorMessageAr(e) })
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-2">
        <Button variant="outline" disabled={busy !== null} onClick={() => void run('print')}>
          <Printer />
          {busy === 'print' ? 'جارٍ التحضير…' : 'طباعة'}
        </Button>
        <Button variant="outline" disabled={busy !== null} onClick={() => void run('pdf')}>
          <FileDown />
          {busy === 'pdf' ? 'جارٍ الحفظ…' : 'حفظ PDF'}
        </Button>
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
