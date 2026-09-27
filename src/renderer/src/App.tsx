import { Button } from '@/components/ui/button'

function App(): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <h1 className="text-3xl font-bold">وثيقة نقل بري</h1>
      <p className="text-muted-foreground">
        Land Bill of Lading — تطبيق لإصدار وثائق النقل البري وطباعتها وتصديرها إلى Excel و Word.
      </p>
      <p className="text-sm">
        رقم البوليصة: A00001 · الكثافة القياسية 15@ · معبر التنف / معبر الوليد
      </p>
      <div className="flex gap-2">
        <Button>وثيقة جديدة</Button>
        <Button variant="outline">السجل</Button>
      </div>
    </main>
  )
}

export default App
