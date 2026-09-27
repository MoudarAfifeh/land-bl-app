import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import type { Api } from '../src/shared/api'
import type { DocumentInput } from '../src/shared/schemas'

type WithApi = { api: Api }

/** Pages in a PDF, counted from its page objects (Chromium writes them uncompressed). */
function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length
}

const long = (text: string, times: number): string => Array(times).fill(text).join(' ')

/** The worst realistic case: all 12 seals and long names everywhere. */
const longDocument: Omit<DocumentInput, 'vesselId'> = {
  issueDate: '2026-09-27',
  shipperName: long('شركة الخليج العربي للتجارة العامة والمقاولات والنقل البري المحدودة', 2),
  shipperAddress: long('العراق - البصرة - شارع الكورنيش - بناية رقم 14 - الطابق الثالث', 2),
  consigneeName: long('Al-Rafidain General Trading and Petroleum Products Company LLC', 2),
  consigneeAddress: long('Syria - Damascus - Free Zone - Building 7 - Office 12', 2),
  product: 'بنزين/ Gasoline - Premium Unleaded RON 95 خالي من الرصاص',
  qtyNaturalL: 36123.456,
  qtyStandardL: 35872.123,
  weightKg: 26789.5,
  barrels: 225.63,
  seals: Array.from({ length: 12 }, (_, i) => `SEAL-2026-${String(1000000 + i)}`),
  density15: 0.7456,
  octane: 95,
  flashPoint: -43,
  temperature: 28.5,
  vcf: 0.99312,
  meterFactor: 1.0002,
  crossingNo: 'CR-2026-000123456',
  supplyOfficerName: long('عبد الرحمن محمد عبد الله الحسيني', 2),
  supplyOfficerTitle: 'رئيس قسم التجهيز والتوزيع في المستودعات الرئيسية',
  missionNo: 'MF-2026/000123456/IRQ-SYR',
  supplyOrderNo: 'SO-2026/000987654/UCC',
  supplyOrderDate: '2026-09-20',
  tankerNo: 'بغداد 123456 أ / 654321',
  driverName: long('محمد عبد الكريم حسين علي الجبوري', 2),
  passportNo: 'A12345678 / N98765432',
  carrierRep: long('شركة النقل الدولي السريع', 2),
  transportDate: '2026-09-27'
}

let app: ElectronApplication
let userData: string

test.beforeAll(async () => {
  // A throwaway userData folder: the real database is never touched.
  userData = mkdtempSync(join(tmpdir(), 'land-bl-e2e-'))
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
})
