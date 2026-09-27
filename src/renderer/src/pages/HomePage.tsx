import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

function HomePage(): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <h1 className="text-3xl font-bold">وثيقة نقل بري</h1>
      <p className="text-muted-foreground">
        Land Bill of Lading — تطبيق لإصدار وثائق النقل البري وطباعتها وتصديرها إلى Excel و Word.
      </p>
      <div className="flex gap-2">
        <Button asChild>
          <Link to="/new">وثيقة جديدة</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/history">السجل</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/settings">الإعدادات</Link>
        </Button>
      </div>
    </main>
  )
}

export default HomePage
