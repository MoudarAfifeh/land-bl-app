import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentsTab } from './settings/AgentsTab'
import { BackupTab } from './settings/BackupTab'
import { LookupsTab } from './settings/LookupsTab'
import { VesselsTab } from './settings/VesselsTab'

const TABS = [
  { value: 'vessels', label: 'البواخر', Content: VesselsTab },
  { value: 'agents', label: 'المخلّصون', Content: AgentsTab },
  { value: 'lookups', label: 'القوائم', Content: LookupsTab },
  { value: 'backup', label: 'النسخ الاحتياطي', Content: BackupTab }
] as const

type TabValue = (typeof TABS)[number]['value']

const isTab = (v: string | null): v is TabValue => TABS.some((t) => t.value === v)

/** Settings, one tab per area. The tab is in the URL (?tab=backup) so other pages can link to it. */
function SettingsPage(): React.JSX.Element {
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const tab: TabValue = isTab(requested) ? requested : 'vessels'

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">الإعدادات</h1>
        <Button asChild variant="link">
          <Link to="/">الرئيسية</Link>
        </Button>
      </header>
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(({ value, Content }) => (
          <TabsContent key={value} value={value} className="pt-3">
            <Content />
          </TabsContent>
        ))}
      </Tabs>
    </main>
  )
}

export default SettingsPage
