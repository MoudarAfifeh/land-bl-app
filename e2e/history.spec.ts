import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import type { Api } from '../src/shared/api'
import { sampleDocument } from '../src/main/services/test-fixtures'

type WithApi = { api: Api }

let app: ElectronApplication
let userData: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'land-bl-e2e-'))
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
})

test.afterAll(async () => {
  // Destroy the window so a half-filled form doesn't ask "leave without saving?".
  await app?.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) w.destroy()
  })
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

test('search the history, duplicate a document as new, and get the next serial', async () => {
  const page = await app.firstWindow()
  await page.waitForFunction(() => 'api' in globalThis)

  const [first, second] = [
    sampleDocument(0, {
      shipperName: 'شركة النور للتجارة',
      driverName: 'أحمد الجبوري',
      tankerNo: 'بغداد 111',
      supplyOrderNo: 'SO-777',
      supplyOrderDate: '2026-09-01',
      seals: ['S-1', 'S-2']
    }),
    sampleDocument(0, { shipperName: 'مؤسسة الفرات', driverName: 'خالد حسن', tankerNo: '222' })
  ]
  const vesselId = await page.evaluate(
    async ([a, b]) => {
      const { api } = globalThis as unknown as WithApi
      const vessel = await api.vessels.create(
        { name: 'MT History', prefix: 'H', arrivalDate: null, isActive: true },
        { makeActive: true }
      )
      await api.documents.create({ ...a, vesselId: vessel.id }, {})
      await api.documents.create({ ...b, vesselId: vessel.id }, {})
      return vessel.id
    },
    [first, second]
  )

  // Both are listed, newest first.
  await page.evaluate(() => (location.hash = '#/history'))
  const rows = page.getByTestId('history-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('H00002')

  // Search with a spelling variant (احمد without hamza): only the first document matches.
  await page.getByLabel('بحث').fill('احمد')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('H00001')
  await expect(page).toHaveURL(/q=/)

  // Duplicate it from the row menu.
  await page.getByRole('button', { name: 'إجراءات الوثيقة H00001' }).click()
  await page.getByRole('menuitem', { name: 'نسخ كوثيقة جديدة' }).click()
  await expect(page.getByText('نسخة من الوثيقة')).toContainText('H00001')

  // Parties are copied; tanker, driver and seals are left for this trip.
  await expect(page.locator('#doc-shipperName')).toHaveValue('شركة النور للتجارة')
  for (let step = 1; step < 4; step++) await page.getByRole('button', { name: 'التالي' }).click()
  await expect(page.locator('#doc-tankerNo')).toHaveValue('')
  await expect(page.locator('#doc-driverName')).toHaveValue('')
  await expect(page.locator('#doc-supplyOrderNo')).toHaveValue('SO-777')
  await page.locator('#doc-tankerNo').fill('بغداد 333')
  await page.locator('#doc-driverName').fill('سائق جديد')
  await page.getByRole('button', { name: 'التالي' }).click()
  await page.getByRole('button', { name: 'حفظ الوثيقة' }).click()

  // The copy gets the vessel's next number.
  await expect(page.getByText('تم حفظ الوثيقة')).toBeVisible()
  await expect(page.getByText('H00003')).toBeVisible()

  const saved = await page.evaluate(async () => {
    const { api } = globalThis as unknown as WithApi
    const list = await api.documents.list({ search: 'H00003' })
    return api.documents.get(list.rows[0].id)
  })
  expect(saved).toMatchObject({
    serialNo: 'H00003',
    vesselId,
    shipperName: 'شركة النور للتجارة',
    supplyOrderNo: 'SO-777',
    supplyOrderDate: '2026-09-01',
    tankerNo: 'بغداد 333',
    driverName: 'سائق جديد',
    seals: []
  })
  expect(saved.issueDate).toBe(
    await page.evaluate(() => {
      const d = new Date()
      const pad = (n: number): string => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    })
  )
})
