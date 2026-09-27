import { useCallback, useEffect, useState } from 'react'
import { Lock, Pencil, Plus, Power, Star } from 'lucide-react'
import type { VesselListRow } from '@shared/api'
import { errorMessageAr } from '@shared/errors'
import { Notice } from '@/components/Notice'
import { VesselDialog } from '@/components/vessels/VesselDialog'
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
import { isoToDisplay } from '@/lib/format'
import { cn } from '@/lib/utils'

const columns = ['اسم الباخرة', 'الحرف', 'تاريخ الوصول', 'الحالة', 'عدد الوثائق', 'آخر رقم']

type DialogState = { kind: 'create' } | { kind: 'edit'; vessel: VesselListRow } | null

/** Vessels: add, edit, activate / deactivate, and choose the current one for new documents. */
export function VesselsTab(): React.JSX.Element {
  const [rows, setRows] = useState<VesselListRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [toDeactivate, setToDeactivate] = useState<VesselListRow | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    window.api.vessels.listWithCounts().then(setRows, (e: unknown) => setError(errorMessageAr(e)))
  }, [])

  useEffect(load, [load])

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
      load()
    } catch (e) {
      setError(errorMessageAr(e))
    } finally {
      setBusy(false)
    }
  }

  const setActive = (v: VesselListRow, isActive: boolean): Promise<void> =>
    run(() =>
      window.api.vessels.update(v.id, {
        name: v.name,
        prefix: v.prefix,
        arrivalDate: v.arrivalDate,
        isActive
      })
    )

  const hasCurrent = rows?.some((v) => v.isCurrent) ?? true

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          الباخرة الحالية تُختار تلقائياً للوثائق الجديدة. الباخرة غير النشطة لا تُصدر لها وثائق
          جديدة، وتبقى وثائقها قابلة للفتح والطباعة والتصدير.
        </p>
        <Button onClick={() => setDialog({ kind: 'create' })}>
          <Plus />
          إضافة باخرة
        </Button>
      </div>

      {!hasCurrent && (
        <Notice tone="warning">
          لا توجد باخرة حالية. اختر «تعيين كحالية» لباخرة نشطة لتُختار تلقائياً في الوثائق الجديدة.
        </Notice>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {rows && rows.length === 0 && <p className="text-muted-foreground">لا توجد بواخر بعد.</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                {columns.map((c) => (
                  <th key={c} scope="col" className="px-3 py-2 text-start font-medium">
                    {c}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">إجراءات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr
                  key={v.id}
                  data-testid="vessel-row"
                  className={cn('border-t', !v.isActive && 'text-muted-foreground')}
                >
                  <td className="px-3 py-2 font-medium">{v.name}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1" dir="ltr">
                      {v.prefix}
                      {v.documentCount > 0 && <Lock className="size-3" aria-label="الحرف مقفل" />}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <bdi dir="ltr">{v.arrivalDate ? isoToDisplay(v.arrivalDate) : '—'}</bdi>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {v.isActive ? 'نشطة' : 'غير نشطة'}
                    {v.isCurrent && (
                      <span className="ms-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                        الحالية
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{v.documentCount}</td>
                  <td className="px-3 py-2">
                    <bdi dir="ltr">{v.lastSerial ?? '—'}</bdi>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDialog({ kind: 'edit', vessel: v })}
                      >
                        <Pencil />
                        تعديل
                      </Button>
                      {v.isActive && !v.isCurrent && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void run(() => window.api.vessels.setActive(v.id))}
                        >
                          <Star />
                          تعيين كحالية
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          v.isCurrent ? setToDeactivate(v) : void setActive(v, !v.isActive)
                        }
                      >
                        <Power />
                        {v.isActive ? 'إيقاف' : 'تفعيل'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === 'create' && (
        <VesselDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          defaultMakeActive={!hasCurrent}
          onSaved={load}
        />
      )}
      {dialog?.kind === 'edit' && (
        <VesselDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          vessel={dialog.vessel}
          onSaved={load}
        />
      )}

      <AlertDialog open={toDeactivate !== null} onOpenChange={(o) => !o && setToDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إيقاف الباخرة الحالية «{toDeactivate?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>
              لن تبقى باخرة حالية، وستحتاج إلى اختيار باخرة لكل وثيقة جديدة حتى تعيّن باخرة أخرى.
              تبقى وثائقها المحفوظة كما هي.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toDeactivate) void setActive(toDeactivate, false)
                setToDeactivate(null)
              }}
            >
              إيقاف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
