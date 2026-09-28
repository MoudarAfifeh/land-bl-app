import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import type { LicenseStatus } from '@shared/api'
import { errorMessageAr } from '@shared/errors'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

/** This PC's code, left to right, with a copy button (the clipboard is written by main). */
export function MachineCode({ code }: { code: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  async function copy(): Promise<void> {
    try {
      await window.api.license.copyMachineCode()
      setCopied(true)
      setFailed(false)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setFailed(true)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <bdi
        dir="ltr"
        className="rounded-md border bg-muted px-3 py-2 font-mono text-lg tracking-wider select-all"
        data-testid="machine-code"
      >
        {code}
      </bdi>
      <Button variant="outline" onClick={() => void copy()}>
        {copied ? <Check /> : <Copy />}
        {copied ? 'تم النسخ' : 'نسخ الرمز'}
      </Button>
      {failed && <span className="text-sm text-destructive">تعذّر النسخ، انسخ الرمز يدويًا.</span>}
    </div>
  )
}

/** A box to paste a license and a button to activate it. Refused licenses show their reason. */
export function LicenseForm({
  submitLabel,
  onActivated
}: {
  submitLabel: string
  onActivated: (status: LicenseStatus) => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const status = await window.api.license.activate(text)
      setText('')
      onActivated(status)
    } catch (e) {
      setError(errorMessageAr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
      <label htmlFor="license-text" className="text-sm font-medium">
        الصق نص الترخيص هنا
      </label>
      <Textarea
        id="license-text"
        dir="ltr"
        rows={8}
        spellCheck={false}
        className="field-sizing-fixed font-mono text-xs"
        placeholder="-----BEGIN LAND BL LICENSE-----"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-invalid={error !== null}
        data-testid="license-text"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive" data-testid="license-error">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={busy || text.trim() === ''}>
          <KeyRound />
          {busy ? 'جارٍ التحقق…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
