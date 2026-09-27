/**
 * Printing and PDF. Both render the /print/:id route in a hidden window, wait until the page
 * says it is ready (fonts, logo, text fitted), then print it or save it as PDF.
 */
import { BrowserWindow, type WebContents } from 'electron'
import type { Api } from '@shared/api'
import { isErrorCode, ServiceError, type ErrorCode } from '@shared/errors'
import type { Db } from '../db/client'
import { lockNavigation, loadRenderer, secureWebPreferences } from '../windows'
import { getPrintableDocument } from './documents'
import { askSavePath, writeOutput } from './save-file'

const READY_TIMEOUT_MS = 15_000

/** A4 at 96 dpi, so the hidden page lays out at print size. */
const A4_PX = { width: 794, height: 1123 }

/**
 * Runs in the print page: resolves with null once `data-print-ready` is set, or with the error
 * code from `data-print-error`, or 'TIMEOUT'.
 */
const waitForReadyScript = `new Promise((resolve) => {
  const started = Date.now()
  const check = () => {
    const d = document.body.dataset
    if (d.printError) resolve(d.printError)
    else if (d.printReady) resolve(null)
    else if (Date.now() - started > ${READY_TIMEOUT_MS}) resolve('TIMEOUT')
    else setTimeout(check, 50)
  }
  check()
})`

async function withPrintPage<T>(
  id: number,
  failure: ErrorCode,
  run: (contents: WebContents) => Promise<T>
): Promise<T> {
  const win = new BrowserWindow({ ...A4_PX, show: false, webPreferences: secureWebPreferences })
  lockNavigation(win)
  try {
    await loadRenderer(win, `/print/${id}`)
    const error: unknown = await win.webContents.executeJavaScript(waitForReadyScript)
    if (error !== null) {
      throw new ServiceError(isErrorCode(error) && error !== 'UNEXPECTED' ? error : failure)
    }
    return await run(win.webContents)
  } catch (error) {
    if (error instanceof ServiceError) throw error
    console.error(error)
    throw new ServiceError(failure)
  } finally {
    win.destroy()
  }
}

function print(contents: WebContents): Promise<boolean> {
  return new Promise((resolve, reject) => {
    contents.print({ silent: false, printBackground: true }, (success, reason) => {
      if (success) resolve(true)
      else if (/cancel/i.test(reason)) resolve(false)
      else reject(new Error(`print failed: ${reason}`))
    })
  })
}

export function createPrintService(db: Db, parent: () => BrowserWindow | null): Api['print'] {
  return {
    async print(id) {
      getPrintableDocument(db, id) // NOT_FOUND / DELETED before opening a window
      const printed = await withPrintPage(id, 'PRINT_FAILED', print)
      return { printed }
    },

    async savePdf(id) {
      const { serialNo } = getPrintableDocument(db, id) // before the dialog
      const path = await askSavePath(parent(), {
        title: 'حفظ PDF',
        defaultName: `${serialNo}.pdf`,
        filter: { name: 'PDF', extensions: ['pdf'] }
      })
      if (!path) return null

      await withPrintPage(id, 'PDF_FAILED', async (contents) => {
        const pdf = await contents.printToPDF({
          pageSize: 'A4',
          printBackground: true,
          preferCSSPageSize: true
        })
        await writeOutput(path, pdf, 'PDF_FAILED')
      })
      return { path }
    }
  }
}
