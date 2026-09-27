import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

/** Empty page with its Arabic title and a way back home. Replaced as each phase lands. */
function PlaceholderPage({ title }: { title: string }): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <h1 className="text-3xl font-bold">{title}</h1>
      <div>
        <Button asChild variant="link" className="px-0">
          <Link to="/">الرئيسية</Link>
        </Button>
      </div>
    </main>
  )
}

export default PlaceholderPage
