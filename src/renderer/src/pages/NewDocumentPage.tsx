import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { DocumentView } from '@shared/api'
import { errorMessageAr } from '@shared/errors'
import { Button } from '@/components/ui/button'
import { useWizardData } from './new-document/hooks'
import { Wizard } from './new-document/Wizard'

/** A new document, blank or ("duplicate as new", /new?from=ID) starting from a saved one. */
function NewDocumentPage(): React.JSX.Element {
  const { data, error, reload } = useWizardData()
  const [params, setParams] = useSearchParams()
  const fromId = params.get('from')
  const [source, setSource] = useState<{ id: string; doc: DocumentView } | null>(null)
  const [sourceError, setSourceError] = useState<string | null>(null)

  useEffect(() => {
    if (fromId === null) return
    let current = true
    window.api.documents.get(Number(fromId)).then(
      (doc) => {
        if (!current) return
        // Deleted documents can't be duplicated (the history hides the action too).
        if (doc.deletedAt !== null) setSourceError('لا يمكن نسخ وثيقة محذوفة')
        else setSource({ id: fromId, doc })
      },
      (e: unknown) => current && setSourceError(errorMessageAr(e))
    )
    return () => {
      current = false
    }
  }, [fromId])

  const duplicate = fromId !== null ? (source?.id === fromId ? source.doc : null) : undefined
  const shownError = error ?? (fromId !== null ? sourceError : null)

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">وثيقة جديدة</h1>
          {duplicate && (
            <p className="text-sm text-muted-foreground">
              نسخة من الوثيقة <bdi dir="ltr">{duplicate.serialNo}</bdi> — أدخل الصهريج والسائق
              والأختام.
            </p>
          )}
        </div>
        <Button asChild variant="link">
          <Link to="/">الرئيسية</Link>
        </Button>
      </header>
      {shownError ? (
        <p role="alert" className="text-destructive">
          {shownError}
        </p>
      ) : data && duplicate !== null ? (
        // Mounted once the data is here, so the active vessel (and the copied values) are the
        // form's defaults from the start. A new key starts a fresh form.
        <Wizard
          key={fromId ?? 'blank'}
          data={data}
          reload={reload}
          source={duplicate}
          onStartNew={() => setParams({}, { replace: true })}
        />
      ) : (
        <p className="text-muted-foreground">جارٍ التحميل…</p>
      )}
    </main>
  )
}

export default NewDocumentPage
