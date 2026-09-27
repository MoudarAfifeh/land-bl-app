import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { useWizardData } from './new-document/hooks'
import { Wizard } from './new-document/Wizard'

function NewDocumentPage(): React.JSX.Element {
  const { data, error, reload } = useWizardData()

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">وثيقة جديدة</h1>
        <Button asChild variant="link">
          <Link to="/">الرئيسية</Link>
        </Button>
      </header>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : data ? (
        // Mounted once the data is here, so the active vessel is the form's default from the start.
        <Wizard data={data} reload={reload} />
      ) : (
        <p className="text-muted-foreground">جارٍ التحميل…</p>
      )}
    </main>
  )
}

export default NewDocumentPage
