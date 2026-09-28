import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type { AppInfo as Info } from '@shared/api'
import { Button } from '@/components/ui/button'

/**
 * Version, data folder and the logs button, for support. Main answers these before activation too
 * (license/gate.ts), so the activation screen shows them as well.
 */
export function AppInfo({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const [info, setInfo] = useState<Info | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    window.api.app.info().then(setInfo, () => setFailed(true))
  }, [])

  async function openLogs(): Promise<void> {
    try {
      await window.api.app.openLogsFolder()
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  const button = (
    <Button variant="outline" onClick={() => void openLogs()} data-testid="open-logs">
      <FolderOpen />
      فتح مجلد السجلات
    </Button>
  )
  const error = failed && (
    <p role="alert" className="text-sm text-destructive">
      تعذّر فتح مجلد السجلات.
      {info && (
        <>
          {' '}
          افتحه يدويًا: <bdi dir="ltr">{info.logsFolder}</bdi>
        </>
      )}
    </p>
  )

  if (compact) {
    return (
      <footer className="flex flex-col gap-2 border-t pt-4 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            الإصدار{' '}
            <bdi dir="ltr" data-testid="app-version">
              {info?.version}
            </bdi>
          </span>
          {button}
        </div>
        {error}
      </footer>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">وثيقة نقل بري</h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">الإصدار</dt>
        <dd>
          <bdi dir="ltr" data-testid="app-version">
            {info?.version}
          </bdi>
        </dd>
        <dt className="text-muted-foreground">مجلد البيانات</dt>
        <dd className="break-all">
          <bdi dir="ltr">{info?.dataFolder}</bdi>
        </dd>
      </dl>
      <div className="flex flex-col gap-2 border-t pt-4">
        <h3 className="font-semibold">السجلات</h3>
        <p className="text-sm text-muted-foreground">
          يسجّل البرنامج الأخطاء في ملفات صغيرة على هذا الجهاز. عند حدوث مشكلة، افتح المجلد وأرسل
          الملفات الموجودة فيه إلى المزوّد.
        </p>
        <div>{button}</div>
        {error}
      </div>
    </section>
  )
}
