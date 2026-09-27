import { useEffect, useState } from 'react'
import type { CustomsAgents } from '@shared/api'
import { errorMessageAr } from '@shared/errors'
import { documentFields, settingFields } from '@shared/fields'
import { Field } from '@/components/form/Field'
import { Notice } from '@/components/Notice'
import { toPrintData, type PrintSource } from '@/components/print/print-data'
import { PrintView } from '@/components/print/PrintView'
import { ROWS_MM, SHEET_WIDTH_MM } from '@/components/print/sheet-geometry'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type AgentKey = keyof CustomsAgents

const agentFields = settingFields.filter(
  (f): f is Extract<(typeof settingFields)[number], { key: AgentKey }> =>
    f.key === 'customsAgent1' || f.key === 'customsAgent2'
)

/** A document with nothing filled in: the preview shows only the agent blocks. */
const blankDocument = {
  ...Object.fromEntries(documentFields.map((f) => [f.key, null])),
  seals: []
} as unknown as PrintSource

/** Rows of the printed sheet that hold the agents (header row 26, blocks in rows 27–32). */
const FIRST_ROW = 26
const LAST_ROW = 32
const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0)
const cropTopMm = sum(ROWS_MM.slice(0, FIRST_ROW - 1))
const cropHeightMm = sum(ROWS_MM.slice(FIRST_ROW - 1, LAST_ROW))

/** The agents part of the real print view, at print size, so line breaks and fit are exact. */
function AgentsPreview({ agents }: { agents: CustomsAgents }): React.JSX.Element {
  const [overflowing, setOverflowing] = useState(0)
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border bg-muted p-4">
        <div
          className="mx-auto overflow-hidden bg-white shadow-md"
          style={{ width: `${SHEET_WIDTH_MM}mm`, height: `${cropHeightMm}mm` }}
          data-testid="agents-preview"
        >
          <div style={{ marginTop: `-${cropTopMm}mm` }}>
            <PrintView data={toPrintData(blankDocument, agents)} onReady={setOverflowing} />
          </div>
        </div>
      </div>
      {overflowing > 0 && (
        <Notice tone="warning">
          النص أطول من الخانة ولا يتسع حتى بأصغر خط. اختصر الأسطر أو قلّل عددها.
        </Notice>
      )}
    </div>
  )
}

/** The two customs agent blocks printed on every new document, with a live preview. */
export function AgentsTab(): React.JSX.Element {
  const [saved, setSaved] = useState<CustomsAgents | null>(null)
  const [draft, setDraft] = useState<Record<AgentKey, string>>({
    customsAgent1: '',
    customsAgent2: ''
  })
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.settings.getCustomsAgents().then(
      (agents) => {
        setSaved(agents)
        setDraft({
          customsAgent1: agents.customsAgent1 ?? '',
          customsAgent2: agents.customsAgent2 ?? ''
        })
      },
      (e: unknown) => setStatus({ ok: false, text: errorMessageAr(e) })
    )
  }, [])

  const changed =
    saved !== null &&
    (draft.customsAgent1 !== (saved.customsAgent1 ?? '') ||
      draft.customsAgent2 !== (saved.customsAgent2 ?? ''))

  async function save(): Promise<void> {
    setSaving(true)
    setStatus(null)
    try {
      const next = await window.api.settings.setCustomsAgents(draft)
      setSaved(next)
      setDraft({ customsAgent1: next.customsAgent1 ?? '', customsAgent2: next.customsAgent2 ?? '' })
      setStatus({ ok: true, text: 'حُفظ. يظهر النص الجديد في الوثائق التي تُحفظ من الآن.' })
    } catch (e) {
      setStatus({ ok: false, text: errorMessageAr(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <Notice tone="info">
        تحتفظ كل وثيقة محفوظة بنص المخلّصين كما كان عند حفظها، فلا تتغير طباعتها أو تصديرها بعد
        تعديل هذا النص. التعديل يطبّق على الوثائق الجديدة فقط.
      </Notice>
      <div className="grid gap-4 md:grid-cols-2">
        {agentFields.map((f) => (
          <Field key={f.key} id={`agent-${f.key}`} label={f.labelAr} hint={f.labelEn}>
            <Textarea
              id={`agent-${f.key}`}
              rows={4}
              value={draft[f.key]}
              disabled={saved === null}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} disabled={!changed || saving}>
          {saving ? 'جارٍ الحفظ…' : 'حفظ'}
        </Button>
        {status && (
          <p
            role={status.ok ? 'status' : 'alert'}
            className={status.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}
          >
            {status.text}
          </p>
        )}
      </div>
      <h2 className="text-lg font-semibold">معاينة الطباعة</h2>
      <AgentsPreview
        agents={{ customsAgent1: draft.customsAgent1, customsAgent2: draft.customsAgent2 }}
      />
    </section>
  )
}
