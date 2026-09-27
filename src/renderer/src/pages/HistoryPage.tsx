import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import type { DocumentListPage, VesselSummary } from '@shared/api'
import { errorMessageAr } from '@shared/errors'
import {
  DeleteDocumentDialog,
  type DeleteTarget
} from '@/components/documents/DeleteDocumentDialog'
import { ActionStatusMessage } from '@/components/print/ActionStatusMessage'
import { useFileActions } from '@/components/print/file-actions'
import { Button } from '@/components/ui/button'
import { HistoryFilters } from './history/HistoryFilters'
import { paramsToQuery, withParams, type HistoryParam } from './history/history-params'
import { HistoryTable } from './history/HistoryTable'

/** Documents history: search, filters and paging in the URL, newest first. */
function HistoryPage(): React.JSX.Element {
  const [params, setParams] = useSearchParams()
  const query = paramsToQuery(params)
  const queryKey = params.toString()

  const [vessels, setVessels] = useState<VesselSummary[]>([])
  /** The last page received, and the request (query + reload count) it answers. */
  const [result, setResult] = useState<(DocumentListPage & { request: string }) | null>(null)
  const [reloads, setReloads] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<DeleteTarget | null>(null)
  const [deletedNotice, setDeletedNotice] = useState<string | null>(null)
  const files = useFileActions()
  const request = `${queryKey}#${reloads}`
  const loading = result?.request !== request

  useEffect(() => {
    window.api.vessels.listAll().then(setVessels, (e: unknown) => setError(errorMessageAr(e)))
  }, [])

  useEffect(() => {
    // Only the latest request may update the table (typing fires several).
    let current = true
    window.api.documents.list(paramsToQuery(new URLSearchParams(queryKey))).then(
      (page) => {
        if (!current) return
        setResult({ ...page, request: `${queryKey}#${reloads}` })
        setError(null)
      },
      (e: unknown) => current && setError(errorMessageAr(e))
    )
    return () => {
      current = false
    }
  }, [queryKey, reloads])

  const change = (changes: Partial<Record<HistoryParam, string | null>>): void => {
    setDeletedNotice(null)
    setParams((current) => withParams(current, changes), { replace: true })
  }

  // Main clamps a page past the end (e.g. after deleting the last row); the buttons start from
  // the page it returned.

  const filtered =
    query.search !== '' || query.vesselId !== null || query.from !== null || query.to !== null
  const first = result && result.total > 0 ? (result.page - 1) * result.pageSize + 1 : 0
  const last = result ? Math.min(result.page * result.pageSize, result.total) : 0
  const lastPage = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">السجل</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/new">وثيقة جديدة</Link>
          </Button>
          <Button asChild variant="link">
            <Link to="/">الرئيسية</Link>
          </Button>
        </div>
      </header>

      <HistoryFilters
        search={query.search}
        vesselId={query.vesselId}
        from={query.from}
        to={query.to}
        includeDeleted={query.includeDeleted}
        vessels={vessels}
        onChange={change}
      />

      <ActionStatusMessage status={files.status} />
      {deletedNotice && (
        <p role="status" className="text-sm text-muted-foreground">
          تم حذف الوثيقة <bdi dir="ltr">{deletedNotice}</bdi>.
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}

      {result && result.rows.length > 0 ? (
        <HistoryTable
          rows={result.rows}
          listSearch={queryKey}
          busy={files.busy}
          onFileAction={(action, row) => void files.run(action, row.id)}
          onDelete={(row) => setToDelete({ id: row.id, serialNo: row.serialNo })}
        />
      ) : (
        result &&
        !loading && (
          <p className="rounded-lg border p-10 text-center text-muted-foreground">
            {filtered ? 'لا توجد وثائق مطابقة للبحث.' : 'لا توجد وثائق بعد.'}
          </p>
        )
      )}

      {result && result.total > 0 && (
        <nav aria-label="الصفحات" className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground" aria-live="polite">
            {first}–{last} من {result.total}
            {loading && ' · جارٍ التحميل…'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={result.page <= 1}
              onClick={() => change({ page: String(result.page - 1) })}
            >
              <ChevronRight />
              السابق
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={result.page >= lastPage}
              onClick={() => change({ page: String(result.page + 1) })}
            >
              التالي
              <ChevronLeft />
            </Button>
          </div>
        </nav>
      )}

      <DeleteDocumentDialog
        target={toDelete}
        onClose={() => setToDelete(null)}
        onDeleted={(t) => {
          files.setStatus(null)
          setDeletedNotice(t.serialNo)
          setReloads((n) => n + 1)
        }}
      />
    </main>
  )
}

export default HistoryPage
