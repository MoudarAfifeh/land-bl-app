import { useRef, useState } from 'react'
import { FileDown, FileSpreadsheet, FileText, Printer, type LucideIcon } from 'lucide-react'
import { errorMessageAr } from '@shared/errors'

export type FileAction = 'print' | 'pdf' | 'excel' | 'word'
export type ActionStatus = { kind: 'saved'; path: string } | { kind: 'error'; text: string } | null

/** Runs an action; resolves with the saved file's path, or null (printed, or cancelled). */
function perform(action: FileAction, id: number): Promise<{ path: string } | null> {
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

export const fileActions: {
  action: FileAction
  icon: LucideIcon
  label: string
  busy: string
}[] = [
  { action: 'print', icon: Printer, label: 'طباعة', busy: 'جارٍ التحضير…' },
  { action: 'pdf', icon: FileDown, label: 'حفظ PDF', busy: 'جارٍ الحفظ…' },
  { action: 'excel', icon: FileSpreadsheet, label: 'تصدير Excel', busy: 'جارٍ التصدير…' },
  { action: 'word', icon: FileText, label: 'تصدير Word', busy: 'جارٍ التصدير…' }
]

/**
 * Print, PDF, Excel and Word for saved documents: one job at a time (each opens a system
 * dialog, printing also a hidden window). Cancelling shows nothing.
 */
export function useFileActions(): {
  busy: FileAction | null
  status: ActionStatus
  setStatus: (status: ActionStatus) => void
  run: (action: FileAction, documentId: number) => Promise<void>
} {
  const [busy, setBusy] = useState<FileAction | null>(null)
  const [status, setStatus] = useState<ActionStatus>(null)
  const busyRef = useRef(false)

  async function run(action: FileAction, documentId: number): Promise<void> {
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

  return { busy, status, setStatus, run }
}
