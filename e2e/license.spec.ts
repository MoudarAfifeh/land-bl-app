import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import type { Api } from '../src/shared/api'
import { errorMessages } from '../src/shared/errors'
import { formatMachineCode } from '../src/main/license/codec'
import { inDays, machineId, testLicense } from './license'

type WithApi = { api: Api }

let userData: string
let apps: ElectronApplication[] = []

async function launch(): Promise<ElectronApplication> {
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
  apps.push(app)
  return app
}

test.beforeAll(() => {
  // No license installed: the app starts on the activation screen.
  userData = mkdtempSync(join(tmpdir(), 'land-bl-e2e-license-'))
})

test.afterAll(async () => {
  for (const app of apps) await app.close().catch(() => undefined)
  apps = []
  rmSync(userData, { recursive: true, force: true })
})

test('without a license only activation works; a valid one opens the app', async () => {
  let app = await launch()
  let page = await app.firstWindow()
  await expect(page.getByTestId('activation-page')).toBeVisible()

  // The machine code, and its copy button (main writes the clipboard).
  const code = formatMachineCode(machineId())
  await expect(page.getByTestId('machine-code')).toHaveText(code)
  await page.getByRole('button', { name: 'نسخ الرمز' }).click()
  await expect(page.getByRole('button', { name: 'تم النسخ' })).toBeVisible()
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(code)

  // Main refuses every other call, whatever the renderer does, and hasn't opened the database.
  const refused = await page.evaluate(async () => {
    const { api } = globalThis as unknown as WithApi
    const codes: string[] = []
    for (const call of [
      () => api.documents.list({} as never),
      () => api.vessels.create({} as never, { makeActive: true }),
      () => api.backup.runNow(),
      () => api.settings.getCustomsAgents()
    ]) {
      await call().then(
        () => codes.push('ok'),
        (e: Error) => codes.push(e.message)
      )
    }
    return codes
  })
  expect(refused).toEqual(Array(4).fill('LICENSE_REQUIRED'))
  expect(existsSync(join(userData, 'land-bl.sqlite'))).toBe(false)

  // Version and logs folder answer before activation, still without the database.
  await expect(page.getByTestId('app-version')).toHaveText(
    await app.evaluate(({ app }) => app.getVersion())
  )
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { opened: string[] }
    g.opened = []
    shell.openPath = (async (path: string) => {
      g.opened.push(path)
      return ''
    }) as never
  })
  await page.getByTestId('open-logs').click()
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened))
    .toEqual([join(userData, 'logs')])
  expect(readFileSync(join(userData, 'logs', 'main.log'), 'utf8')).toMatch(/ INFO Started /)
  expect(existsSync(join(userData, 'land-bl.sqlite'))).toBe(false)

  // No route leads past the activation screen.
  await page.evaluate(() => (location.hash = '#/settings'))
  await expect(page.getByTestId('activation-page')).toBeVisible()

  // A license for another machine is refused with its reason.
  const box = page.getByTestId('license-text')
  await box.fill(testLicense({ machineId: '0000111122223333' }))
  await page.getByRole('button', { name: 'تفعيل' }).click()
  await expect(page.getByTestId('license-error')).toHaveText(errorMessages.LICENSE_WRONG_MACHINE)

  // A valid one, expiring in 10 days: the app opens on the home page, with the warning.
  await box.fill(testLicense({ expiresAt: inDays(10) }))
  await page.getByRole('button', { name: 'تفعيل' }).click()
  await expect(page.getByRole('heading', { name: 'وثيقة نقل بري' })).toBeVisible()
  await expect(page.getByTestId('license-expiry-warning')).toContainText('بعد 10 أيام')
  expect(
    await page.evaluate(async () => {
      const { api } = globalThis as unknown as WithApi
      return (await api.vessels.listAll()).length
    })
  ).toBe(0)

  // Still active after a restart.
  await app.close()
  app = await launch()
  page = await app.firstWindow()
  await expect(page.getByRole('heading', { name: 'وثيقة نقل بري' })).toBeVisible()

  // Settings shows the license; a renewal without expiry removes the warning.
  await page.getByRole('link', { name: 'الترخيص' }).click()
  await expect(page.getByTestId('license-customer')).toHaveText('E2E Test Office')
  await page.getByTestId('license-text').fill('not a license')
  await page.getByRole('button', { name: 'تحديث الترخيص' }).click()
  await expect(page.getByTestId('license-error')).toHaveText(errorMessages.LICENSE_INVALID)
  await page.getByTestId('license-text').fill(testLicense({ customerName: 'Renewed Office' }))
  await page.getByRole('button', { name: 'تحديث الترخيص' }).click()
  await expect(page.getByTestId('license-customer')).toHaveText('Renewed Office')
  await expect(page.getByTestId('license-expiry')).toContainText('دائم')
  await expect(page.getByTestId('license-expiry-warning')).toHaveCount(0)
})
