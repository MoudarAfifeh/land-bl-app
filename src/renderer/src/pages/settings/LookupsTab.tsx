import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { errorMessageAr } from '@shared/errors'
import { documentFieldByKey } from '@shared/fields'
import { findDuplicate, findSimilar } from '@shared/lookups'
import { normalizeSearch, searchTokens } from '@shared/search'
import { controlProps } from '@/components/form/control-props'
import { Field } from '@/components/form/Field'
import { Notice } from '@/components/Notice'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/** One entry of any lookup list, as this screen shows it: a name and maybe one more value. */
interface Entry {
  id: number
  name: string
  extra: string | null
}

interface LookupKind {
  value: string
  title: string
  /** One entry, for the dialog title: «إضافة سائق». */
  singular: string
  nameLabel: string
  /** Label of the second value (address, passport), if the list has one. */
  extraLabel: string | null
  list: () => Promise<Entry[]>
  create: (name: string, extra: string) => Promise<unknown>
  update: (id: number, name: string, extra: string) => Promise<unknown>
  remove: (id: number) => Promise<void>
}

const api = (): typeof window.api.lookups => window.api.lookups

const KINDS: LookupKind[] = [
  {
    value: 'parties',
    title: 'الجهات',
    singular: 'جهة',
    nameLabel: 'اسم الجهة',
    extraLabel: documentFieldByKey('shipperAddress').labelAr,
    list: async () =>
      (await api().listParties()).map((p) => ({ id: p.id, name: p.name, extra: p.address })),
    create: (name, address) => api().createParty({ name, address }),
    update: (id, name, address) => api().updateParty(id, { name, address }),
    remove: (id) => api().deleteParty(id)
  },
  {
    value: 'drivers',
    title: 'السائقون',
    singular: 'سائق',
    nameLabel: documentFieldByKey('driverName').labelAr,
    extraLabel: documentFieldByKey('passportNo').labelAr,
    list: async () =>
      (await api().listDrivers()).map((d) => ({ id: d.id, name: d.name, extra: d.passportNo })),
    create: (name, passportNo) => api().createDriver({ name, passportNo }),
    update: (id, name, passportNo) => api().updateDriver(id, { name, passportNo }),
    remove: (id) => api().deleteDriver(id)
  },
  {
    value: 'tankers',
    title: 'الصهاريج',
    singular: 'صهريج',
    nameLabel: documentFieldByKey('tankerNo').labelAr,
    extraLabel: null,
    list: async () =>
      (await api().listTankers()).map((t) => ({ id: t.id, name: t.tankerNo, extra: null })),
    create: (tankerNo) => api().createTanker({ tankerNo }),
    update: (id, tankerNo) => api().updateTanker(id, { tankerNo }),
    remove: (id) => api().deleteTanker(id)
  }
]

const nameOf = (e: Entry): string => e.name

/** Add or edit one entry. Exact duplicates are refused; spelling variants get a warning. */
function EntryDialog({
  kind,
  entries,
  entry,
  onClose,
  onSaved
}: {
  kind: LookupKind
  entries: Entry[]
  /** null = add a new entry. */
  entry: Entry | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [name, setName] = useState(entry?.name ?? '')
  const [extra, setExtra] = useState(entry?.extra ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const exceptId = entry?.id ?? null
  const duplicate = findDuplicate(entries, nameOf, name, exceptId)
  const similar = findSimilar(entries, nameOf, name, exceptId)

  async function save(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      if (entry) await kind.update(entry.id, name, extra)
      else await kind.create(name, extra)
      onSaved()
      onClose()
    } catch (e) {
      setError(errorMessageAr(e))
    } finally {
      setSaving(false)
    }
  }

  const nameError = duplicate ? `«${duplicate.name}» موجود مسبقاً في القائمة` : undefined
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {entry ? 'تعديل' : 'إضافة'} {kind.singular}
          </DialogTitle>
          <DialogDescription>
            القائمة للاقتراحات في النموذج فقط؛ الوثائق المحفوظة لا تتغير.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!duplicate && name.trim() !== '') void save()
          }}
        >
          <Field id="lookup-name" label={kind.nameLabel} required error={nameError}>
            <Input
              {...controlProps('lookup-name', nameError)}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {similar.length > 0 && !duplicate && (
            <Notice tone="warning">
              يوجد اسم مشابه في القائمة: {similar.map((s) => `«${s.name}»`).join('، ')}. تأكد أنه
              ليس نفسه قبل الحفظ.
            </Notice>
          )}
          {kind.extraLabel && (
            <Field id="lookup-extra" label={kind.extraLabel}>
              <Input
                id="lookup-extra"
                autoComplete="off"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
            </Field>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving || !!duplicate || name.trim() === ''}>
              {similar.length > 0 && !duplicate ? 'حفظ على أي حال' : 'حفظ'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LookupList({ kind }: { kind: LookupKind }): React.JSX.Element {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Entry | 'new' | null>(null)
  const [toDelete, setToDelete] = useState<Entry | null>(null)

  const load = useCallback(() => {
    kind.list().then(setEntries, (e: unknown) => setError(errorMessageAr(e)))
  }, [kind])
  useEffect(load, [load])

  const shown = useMemo(() => {
    const tokens = searchTokens(search)
    return (entries ?? []).filter((e) => {
      const text = normalizeSearch(`${e.name} ${e.extra ?? ''}`)
      return tokens.every((t) => text.includes(t))
    })
  }, [entries, search])

  async function remove(entry: Entry): Promise<void> {
    setError(null)
    try {
      await kind.remove(entry.id)
    } catch (e) {
      setError(errorMessageAr(e))
    }
    load()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <Field id={`search-${kind.value}`} label="بحث" className="w-72">
          <Input
            id={`search-${kind.value}`}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Button onClick={() => setEditing('new')}>
          <Plus />
          إضافة
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {entries && (
        <p className="text-sm text-muted-foreground">
          {shown.length === entries.length
            ? `${entries.length} في القائمة`
            : `${shown.length} من ${entries.length}`}
        </p>
      )}
      {shown.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  {kind.nameLabel}
                </th>
                {kind.extraLabel && (
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    {kind.extraLabel}
                  </th>
                )}
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">إجراءات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} data-testid="lookup-row" className="border-t">
                  <td className="px-3 py-2" dir="auto">
                    {e.name}
                  </td>
                  {kind.extraLabel && (
                    <td className="px-3 py-2" dir="auto">
                      {e.extra ?? '—'}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>
                        <Pencil />
                        تعديل
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setToDelete(e)}
                      >
                        <Trash2 />
                        حذف
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && entries && (
        <EntryDialog
          kind={kind}
          entries={entries}
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف «{toDelete?.name}» من القائمة؟</AlertDialogTitle>
            <AlertDialogDescription>
              يُحذف من اقتراحات النموذج فقط. الوثائق المحفوظة لا تتغير، ويمكن إضافته من جديد لاحقاً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (toDelete) void remove(toDelete)
                setToDelete(null)
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Parties, drivers and tankers behind the form's autocompletes. */
export function LookupsTab(): React.JSX.Element {
  return (
    <Tabs defaultValue="parties">
      <TabsList>
        {KINDS.map((k) => (
          <TabsTrigger key={k.value} value={k.value}>
            {k.title}
          </TabsTrigger>
        ))}
      </TabsList>
      {KINDS.map((k) => (
        <TabsContent key={k.value} value={k.value} className="pt-2">
          <LookupList kind={k} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
