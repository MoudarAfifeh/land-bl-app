import { useEffect, useLayoutEffect, useRef } from 'react'
import { documentFieldByKey } from '@shared/fields'
import logo from '@/assets/logo.jpeg'
import type { PrintData } from './print-data'
import { PLACED_CELLS, type PlacedCell } from './print-layout'
import { COLUMNS_MM, ROWS_MM, SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from './sheet-geometry'
import './print.css'

/** Long text shrinks down to this size before it is reported as overflowing. */
const MIN_FONT_PT = 5.5

const numericTypes = new Set(['number', 'date'])

function labelText(ar: string, en: string | undefined, stack: boolean | undefined): string {
  if (!en) return ar
  return stack ? `${ar}\n${en}` : `${ar} / ${en}`
}

/**
 * Shrinks every cell's text until it fits its cell (it wraps first). Cells that still don't fit
 * at the minimum size get `data-overflow`. Returns how many overflow.
 */
function fitAll(root: HTMLElement): number {
  let overflowing = 0
  for (const el of root.querySelectorAll<HTMLElement>('[data-fit]')) {
    const cell = el.parentElement!
    const overflows = (): boolean =>
      el.scrollWidth > el.clientWidth + 1 || el.offsetHeight > cell.clientHeight + 1
    let size = Number(el.dataset.fit)
    el.style.fontSize = `${size}pt`
    while (size > MIN_FONT_PT && overflows()) {
      size = Math.max(MIN_FONT_PT, size - 0.5)
      el.style.fontSize = `${size}pt`
    }
    if (overflows()) {
      el.dataset.overflow = '1'
      overflowing++
    } else {
      delete el.dataset.overflow
    }
  }
  return overflowing
}

/** The text of a cell and its direction: numbers and dates read left to right. */
function cellText(
  cell: PlacedCell,
  data: PrintData
): { text: string; dir: 'ltr' | 'rtl' | 'auto' | undefined } {
  const c = cell.content
  switch (c.kind) {
    case 'text':
      return { text: labelText(c.ar, c.en, cell.stack), dir: cell.dir }
    case 'label': {
      const f = documentFieldByKey(c.field)
      return { text: labelText(f.labelAr, f.labelEn, cell.stack), dir: cell.dir }
    }
    case 'value': {
      const type = documentFieldByKey(c.field).type
      return {
        text: data.values[c.field],
        dir: cell.dir ?? (numericTypes.has(type) ? 'ltr' : 'auto')
      }
    }
    case 'seal':
      return { text: data.seals[c.index] ?? '', dir: 'auto' }
    case 'agent':
      return { text: data.agents[c.key], dir: 'auto' }
    default:
      return { text: '', dir: undefined }
  }
}

interface PrintViewProps {
  data: PrintData
  /** Shown in the serial cell before the document is saved (screen only). */
  pendingSerial?: string
  /** Called once fonts and the logo are loaded and every cell is fitted. */
  onReady?: (overflowing: number) => void
  onError?: (error: unknown) => void
}

/** One A4 page reproducing templates/land-bl.xlsx. */
export function PrintView({
  data,
  pendingSerial,
  onReady,
  onError
}: PrintViewProps): React.JSX.Element {
  const sheetRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLImageElement>(null)
  const callbacks = useRef({ onReady, onError })

  useLayoutEffect(() => {
    callbacks.current = { onReady, onError }
  })

  // Fit right away so the first paint is already right, then again once fonts and the logo are
  // in: font metrics can change when a fallback font finishes loading.
  useLayoutEffect(() => {
    if (sheetRef.current) fitAll(sheetRef.current)
  }, [data, pendingSerial])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await document.fonts.ready
      await logoRef.current?.decode()
      if (cancelled || !sheetRef.current) return
      callbacks.current.onReady?.(fitAll(sheetRef.current))
    })().catch((error: unknown) => {
      if (!cancelled) callbacks.current.onError?.(error)
    })
    return () => {
      cancelled = true
    }
  }, [data, pendingSerial])

  function renderCell(cell: PlacedCell): React.JSX.Element {
    const c = cell.content
    const spill = cell.spillLeft ?? 0
    const classes = ['ps-cell', `ps-align-${cell.align ?? 'start'}`]
    if (cell.fill) classes.push(`ps-fill-${cell.fill}`)
    if (cell.bottom === 'thick') classes.push('ps-bottom-thick')
    if (cell.right) classes.push(`ps-right-${cell.right}`)
    const style: React.CSSProperties = {
      gridColumn: `${cell.col - spill} / span ${cell.colSpan + spill}`,
      gridRow: `${cell.row} / span ${cell.rowSpan}`
    }

    if (c.kind === 'logo') {
      return (
        <div key={`${cell.row}-${cell.col}`} className={classes.join(' ')} style={style}>
          <img ref={logoRef} src={logo} alt="" className="ps-logo" />
        </div>
      )
    }

    let { text, dir } = cellText(cell, data)
    let pending = false
    if (c.kind === 'value' && c.field === 'serialNo' && !text && pendingSerial) {
      text = pendingSerial
      dir = 'rtl'
      pending = true
    }
    const isValue = c.kind === 'value' || c.kind === 'seal' || c.kind === 'agent'
    if (isValue) classes.push('ps-value')
    if (pending) classes.push('ps-pending')

    return (
      <div key={`${cell.row}-${cell.col}`} className={classes.join(' ')} style={style}>
        {text && (
          <div className="ps-text" dir={dir} data-fit={cell.size ?? 10}>
            {text}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={sheetRef}
      className="ps-sheet"
      role="document"
      aria-label="وثيقة نقل بري"
      style={{
        width: `${SHEET_WIDTH_MM}mm`,
        height: `${SHEET_HEIGHT_MM}mm`,
        gridTemplateColumns: COLUMNS_MM.map((mm) => `${mm.toFixed(3)}mm`).join(' '),
        gridTemplateRows: ROWS_MM.map((mm) => `${mm.toFixed(3)}mm`).join(' ')
      }}
    >
      {PLACED_CELLS.map(renderCell)}
    </div>
  )
}
