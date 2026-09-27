import { useLayoutEffect, useRef, useState } from 'react'
import type { PrintData } from './print-data'
import { PrintView } from './PrintView'
import { SHEET_WIDTH_PX } from './sheet-geometry'

/** Don't blow the page up past this on wide windows. */
const MAX_ZOOM = 1.25

/** The print view on screen, scaled to the width available, on a paper-like background. */
export function PrintPreview({
  data,
  pendingSerial
}: {
  data: PrintData
  pendingSerial?: string
}): React.JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new ResizeObserver(([entry]) => {
      setZoom(Math.min(MAX_ZOOM, entry.contentRect.width / SHEET_WIDTH_PX))
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="rounded-lg border bg-muted p-4">
      <div ref={frameRef} className="mx-auto w-full">
        <div className="mx-auto w-fit bg-white shadow-md" style={{ zoom }}>
          <PrintView data={data} pendingSerial={pendingSerial} />
        </div>
      </div>
    </div>
  )
}
