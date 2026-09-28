import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import type { Api } from '../src/shared/api'
import { longDocument } from '../src/main/services/test-fixtures'
import { installTestLicense } from './license'

type WithApi = { api: Api }

/** Pages in a PDF, counted from its page objects (Chromium writes them uncompressed). */
function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length
}

let app: ElectronApplication
let userData: string

test.beforeAll(async () => {
  // A throwaway userData folder: the real database is never touched.
  userData = mkdtempSync(join(tmpdir(), 'land-bl-e2e-'))
  installTestLicense(userData)
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
  expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(userData)
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

test('a document with 12 seals and long names prints on exactly one A4 page', async () => {
  const page = await app.firstWindow()
  await page.waitForFunction(() => 'api' in globalThis)

  const id = await page.evaluate(async (doc) => {
    const { api } = globalThis as unknown as WithApi
    const vessel = await api.vessels.create(
      { name: 'MT Test', prefix: 'T', arrivalDate: null, isActive: true },
      { makeActive: true }
    )
    return (await api.documents.create({ ...doc, vesselId: vessel.id }, {})).id
  }, longDocument)

  // Answer the save dialog with a temp path instead of showing it.
  const pdfPath = join(userData, 'out.pdf')
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as never
  }, pdfPath)

  const saved = await page.evaluate(
    (docId) => (globalThis as unknown as WithApi).api.print.savePdf(docId),
    id
  )
  expect(saved).toEqual({ path: pdfPath })

  const pdf = readFileSync(pdfPath)
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  expect(pdfPageCount(pdf)).toBe(1)

  // The same page in the main window: every cell's text fits, none is clipped.
  await page.evaluate((docId) => (location.hash = `#/print/${docId}`), id)
  await page.waitForSelector('body[data-print-ready]')
  expect(await page.evaluate(() => document.body.dataset.printOverflow)).toBe('0')
  await expect(page.locator('.ps-sheet')).toContainText('T00001')
  await expect(page.locator('.ps-sheet')).toContainText('SEAL-2026-1000011')

  // The developer credit is on every screen but never on what gets printed or saved as PDF.
  expect(await page.evaluate(() => document.body.innerText)).not.toContain('moudarAf')
  await expect(page.getByTestId('developer-credit')).toHaveCount(0)
})
