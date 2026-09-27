import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { errorMessageAr, isErrorCode } from '@shared/errors'
import { toPrintData, type PrintData } from '@/components/print/print-data'
import { PrintView } from '@/components/print/PrintView'

/**
 * Only the print view of a saved document. Main loads this route in a hidden window and waits
 * for `data-print-ready` (or `data-print-error`) on <body> before printing.
 */
function PrintPage(): React.JSX.Element {
  const { id } = useParams()
  const [data, setData] = useState<PrintData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const body = document.body.dataset
    function fail(e: unknown): void {
      const code = e instanceof Error && isErrorCode(e.message) ? e.message : 'UNEXPECTED'
      body.printError = code
      setError(errorMessageAr(e))
    }
    // A saved document prints with its own agent blocks, not the current settings.
    window.api.documents
      .get(Number(id))
      .then((doc) => setData(toPrintData(doc, doc)))
      .catch(fail)
    return () => {
      delete body.printReady
      delete body.printError
      delete body.printOverflow
    }
  }, [id])

  if (error) {
    return (
      <p role="alert" className="p-8 text-destructive">
        {error}
      </p>
    )
  }
  if (!data) return <></>
  return (
    <div className="print-page">
      <PrintView
        data={data}
        onReady={(overflowing) => {
          document.body.dataset.printOverflow = String(overflowing)
          document.body.dataset.printReady = '1'
        }}
        onError={() => {
          document.body.dataset.printError = 'PRINT_FAILED'
          setError(errorMessageAr(new Error('PRINT_FAILED')))
        }}
      />
    </div>
  )
}

export default PrintPage
