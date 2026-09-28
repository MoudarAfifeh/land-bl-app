import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import type { Api } from '../src/shared/api'
import { longDocument } from '../src/main/services/test-fixtures'
import { installTestLicense, testLicense } from './license'

type WithApi = { api: Api }

let app: ElectronApplication
let userData: string

test.beforeAll(async () => {
  // No license yet: the first screen is activation.
  userData = mkdtempSync(join(tmpdir(), 'land-bl-e2e-credit-'))
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

/** The credit is shown, the name in a <bdi>, and the footer comes after everything else. */
async function expectCredit(page: Page): Promise<void> {
  const credit = page.getByTestId('developer-credit')
  await expect(credit).toHaveCount(1)
  await expect(credit).toBeVisible()
  await expect(credit).toHaveText('تم التطوير بواسطة moudarAf')
  await expect(credit.locator('bdi')).toHaveText('moudarAf')

  const overlap = await page.evaluate(() => {
    const footer = document.querySelector('[data-testid="developer-credit"]')!
    const top = footer.getBoundingClientRect().top
    // Lowest bottom edge of any visible element outside the footer.
    let lowest = 0
    for (const el of document.body.querySelectorAll('*')) {
      if (footer.contains(el) || el.contains(footer)) continue
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) lowest = Math.max(lowest, r.bottom)
    }
    return { top, lowest }
  })
  expect(overlap.lowest).toBeLessThanOrEqual(overlap.top + 0.5)
}

test('the developer credit is on every screen, below the content', async () => {
  const page = await app.firstWindow()
  await expect(page.getByTestId('activation-page')).toBeVisible()
  await expectCredit(page)

  await page.getByTestId('license-text').fill(testLicense())
  await page.getByRole('button', { name: 'تفعيل' }).click()
  await expect(page.getByRole('heading', { name: 'وثيقة نقل بري' })).toBeVisible()
  await expectCredit(page)

  const id = await page.evaluate(async (doc) => {
    const { api } = globalThis as unknown as WithApi
    const vessel = await api.vessels.create(
      { name: 'MT Credit', prefix: 'C', arrivalDate: null, isActive: true },
      { makeActive: true }
    )
    return (await api.documents.create({ ...doc, vesselId: vessel.id }, {})).id
  }, longDocument)

  for (const route of ['/new', '/history', `/documents/${id}`, '/settings']) {
    await page.evaluate((r) => (location.hash = `#${r}`), route)
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('main').first()).toBeVisible()
    await expectCredit(page)
  }

  // Settings → حول البرنامج: name and WhatsApp next to the version.
  await page.evaluate(() => (location.hash = '#/settings?tab=about'))
  await expect(page.getByTestId('app-version')).not.toBeEmpty()
  await expect(page.getByTestId('developer-whatsapp')).toHaveText('+31684908217')
  await expectCredit(page)
})

test.describe('with a stored license', () => {
  test('the credit shows on a long page too, after the content', async () => {
    // A second launch on the same data: straight to the app.
    const dir = mkdtempSync(join(tmpdir(), 'land-bl-e2e-credit-long-'))
    installTestLicense(dir)
    const second = await electron.launch({ args: ['.', `--user-data-dir=${dir}`] })
    try {
      const page = await second.firstWindow()
      await page.setViewportSize({ width: 900, height: 400 })
      await page.evaluate(() => (location.hash = '#/new'))
      await expect(page.locator('main').first()).toBeVisible()
      await expectCredit(page)
    } finally {
      await second.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
