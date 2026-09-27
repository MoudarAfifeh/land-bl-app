import { Copy, Eye, MoreHorizontal, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import type { DocumentListRow } from '@shared/api'
import { fileActions, type FileAction } from '@/components/print/file-actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { isoToDisplay } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Props {
  rows: DocumentListRow[]
  /** Query string of the list, so the document page can link back to the same filters. */
  listSearch: string
  busy: FileAction | null
  onFileAction: (action: FileAction, row: DocumentListRow) => void
  onDelete: (row: DocumentListRow) => void
}

const columns = [
  'رقم البوليصة',
  'تاريخ الإصدار',
  'الباخرة',
  'الجهة المرسلة',
  'المرسل إليها',
  'رقم الصهريج',
  'اسم السائق'
]

/** The documents of one page. Clicking a row opens it; "⋯" has every action. */
export function HistoryTable({
  rows,
  listSearch,
  busy,
  onFileAction,
  onDelete
}: Props): React.JSX.Element {
  const navigate = useNavigate()
  const open = (id: number): void => void navigate(`/documents/${id}`, { state: { listSearch } })

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                scope="col"
                className="px-3 py-2 text-start font-medium whitespace-nowrap"
              >
                {c}
              </th>
            ))}
            <th scope="col" className="w-12 px-3 py-2">
              <span className="sr-only">إجراءات</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const deleted = row.deletedAt !== null
            return (
              <tr
                key={row.id}
                data-testid="history-row"
                className={cn(
                  'cursor-pointer border-t hover:bg-muted/40',
                  deleted && 'text-muted-foreground'
                )}
                onClick={() => open(row.id)}
              >
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link
                    to={`/documents/${row.id}`}
                    state={{ listSearch }}
                    dir="ltr"
                    className="font-medium tabular-nums hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {row.serialNo}
                  </Link>
                  {deleted && (
                    <span className="ms-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                      محذوفة
                    </span>
                  )}
                </td>
                <td dir="ltr" className="px-3 py-2 text-end whitespace-nowrap">
                  {isoToDisplay(row.issueDate)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {row.vesselName}
                  {!row.vesselActive && (
                    <span className="ms-1 text-xs text-muted-foreground">(غير نشطة)</span>
                  )}
                </td>
                <td className="max-w-56 truncate px-3 py-2" title={row.shipperName}>
                  {row.shipperName}
                </td>
                <td className="max-w-56 truncate px-3 py-2" title={row.consigneeName}>
                  {row.consigneeName}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <bdi>{row.tankerNo}</bdi>
                </td>
                <td className="max-w-48 truncate px-3 py-2" title={row.driverName}>
                  {row.driverName}
                </td>
                <td className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu dir="rtl">
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`إجراءات الوثيقة ${row.serialNo}`}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => open(row.id)}>
                        <Eye />
                        فتح
                      </DropdownMenuItem>
                      {!deleted && (
                        <>
                          {fileActions.map((a) => (
                            <DropdownMenuItem
                              key={a.action}
                              disabled={busy !== null}
                              onSelect={() => onFileAction(a.action, row)}
                            >
                              <a.icon />
                              {a.label}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuItem onSelect={() => void navigate(`/new?from=${row.id}`)}>
                            <Copy />
                            نسخ كوثيقة جديدة
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(row)}>
                            <Trash2 />
                            حذف
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
