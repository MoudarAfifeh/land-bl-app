import { useEffect, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import type { CustomsAgents, DocumentView, VesselSummary } from '@shared/api'
import { errorMessageAr } from '@shared/errors'
import { DeleteDocumentDialog } from '@/components/documents/DeleteDocumentDialog'
import { PrintActions } from '@/components/print/PrintActions'
import { PrintPreview } from '@/components/print/PrintPreview'
import { toPrintData } from '@/components/print/print-data'
import { Button } from '@/components/ui/button'
import { isoToDisplay, todayIso } from '@/lib/format'

interface Loaded {
  doc: DocumentView
  agents: CustomsAgents
  vessel: VesselSummary | undefined
}

/**
 * A saved document, read only: its print view and actions. A deleted document shows the
 * «محذوفة» banner and can only be viewed (main refuses to print or export it too).
 */
function DocumentPage(): React.JSX.Element {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const listSearch = (location.state as { listSearch?: string } | null)?.listSearch ?? ''
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    let current = true
    Promise.all([
      window.api.documents.get(Number(id)),
      window.api.settings.getCustomsAgents(),
      window.api.vessels.listAll()
    ]).then(
      ([doc, agents, vessels]) =>
        current && setLoaded({ doc, agents, vessel: vessels.find((v) => v.id === doc.vesselId) }),
      (e: unknown) => current && setError(errorMessageAr(e))
    )
    return () => {
      current = false
    }
  }, [id])

  const doc = loaded?.doc
  const deleted = doc?.deletedAt != null

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 p-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">
            وثيقة <bdi dir="ltr">{doc?.serialNo ?? ''}</bdi>
          </h1>
          {loaded?.vessel && (
            <p className="text-sm text-muted-foreground">
              الباخرة: {loaded.vessel.name}
              {!loaded.vessel.isActive && ' (غير نشطة)'}
            </p>
          )}
        </div>
        <Button asChild variant="link">
          <Link to={`/history${listSearch ? `?${listSearch}` : ''}`}>العودة إلى السجل</Link>
        </Button>
      </header>

      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}

      {loaded && doc && (
        <>
          {deleted ? (
            <p
              role="status"
              data-testid="deleted-banner"
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive"
            >
              <strong>محذوفة</strong> — حُذفت هذه الوثيقة بتاريخ{' '}
              <bdi dir="ltr">{isoToDisplay(todayIso(new Date(doc.deletedAt!)))}</bdi>. يمكن عرضها
              فقط، ولا يمكن طباعتها أو تصديرها أو نسخها.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <PrintActions documentId={doc.id} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void navigate(`/new?from=${doc.id}`)}>
                  <Copy />
                  نسخ كوثيقة جديدة
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 />
                  حذف
                </Button>
              </div>
            </div>
          )}
          <PrintPreview data={toPrintData(doc, loaded.agents)} />
          <DeleteDocumentDialog
            target={confirmDelete ? { id: doc.id, serialNo: doc.serialNo } : null}
            onClose={() => setConfirmDelete(false)}
            onDeleted={() =>
              setLoaded({ ...loaded, doc: { ...doc, deletedAt: new Date().toISOString() } })
            }
          />
        </>
      )}
    </main>
  )
}

export default DocumentPage
