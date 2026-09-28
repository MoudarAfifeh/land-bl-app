/**
 * Screenshots for the Arabic user guide (npm run screenshots): the packaged exe from dist-e2e/
 * (test license key), a throwaway userData folder with fake demo data (demo-data.ts), a
 * 1366×768 window in the light theme. Writes docs/screenshots/NN-*.png and sample-document.pdf.
 *
 * Page shots are full-page, so the developer footer shows on pages taller than the window;
 * shots with a dialog or menu open are the window only. Before each shot the machine code and
 * the data and backup folders are replaced in the page with neutral examples (maskPage).
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import type { Api } from '../src/shared/api'
import { testLicense } from '../e2e/license'
import {
  demoAgents,
  demoDocuments,
  demoDrivers,
  demoOffice,
  demoParties,
  demoTankers,
  demoVessels
} from './demo-data'

type WithApi = { api: Api }

const EXE = resolve('dist-e2e/win-unpacked/land-bl.exe')
const OUT = resolve('docs/screenshots')
const WIDTH = 1366
const HEIGHT = 768

let app: ElectronApplication
let page: Page
let work: string

test.beforeAll(async () => {
  if (!existsSync(EXE)) throw new Error(`${EXE} is missing: run npm run build:test-package`)
  mkdirSync(OUT, { recursive: true })
  for (const f of readdirSync(OUT)) if (/^\d\d-.*\.png$/.test(f)) rmSync(join(OUT, f))
  // A fixed name, so the backup paths shown in the shots don't change from run to run.
  work = join(tmpdir(), 'land-bl-guide')
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work)
  app = await electron.launch({
    executablePath: EXE,
    args: [`--user-data-dir=${join(work, 'userData')}`]
  })
  page = await app.firstWindow()
  await app.evaluate(
    ({ BrowserWindow, nativeTheme }, [w, h]) => {
      nativeTheme.themeSource = 'light'
      for (const win of BrowserWindow.getAllWindows()) win.setContentSize(w, h)
    },
    [WIDTH, HEIGHT]
  )
  // Display scaling can round the window by a pixel or two: pin the page to 1366×768 CSS px.
  await page.setViewportSize({ width: WIDTH, height: HEIGHT })
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(WIDTH)
})

test.afterAll(async () => {
  // Destroy the window so a half-filled form doesn't ask "leave without saving?".
  await app
    ?.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) w.destroy()
    })
    .catch(() => undefined)
  await app?.close().catch(() => undefined)
  if (work) rmSync(work, { recursive: true, force: true })
})

/** Shown instead of this PC's machine code and the real folders. */
const FAKE_MACHINE_CODE = 'A1B2-C3D4-E5F6-7890'
const FAKE_USER_DATA = 'C:\\Users\\Office\\AppData\\Roaming\\land-bl'
const FAKE_BACKUPS = 'C:\\Users\\Office\\Documents\\land-bl-backups'

/** Real text → neutral text, applied to the page before every shot (the app is not changed). */
let masks: [string, string][] = []

async function setUpMasks(): Promise<void> {
  const machineCode = await page.evaluate(
    async () => (await (globalThis as unknown as WithApi).api.license.status()).machineCode
  )
  if (!machineCode) throw new Error('No machine code to mask')
  masks = [
    [machineCode, FAKE_MACHINE_CODE],
    [join(work, 'userData'), FAKE_USER_DATA],
    [join(work, 'backups'), FAKE_BACKUPS]
  ]
}

/** Replaces the masked text in the page, then checks none of it (or the home folder) is left. */
async function maskPage(): Promise<void> {
  const left = await page.evaluate(
    ({ pairs, forbidden }) => {
      const swap = (s: string): string =>
        pairs.reduce((out, [from, to]) => out.split(from).join(to), s)
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.nodeValue ?? ''
        const masked = swap(text)
        if (masked !== text) n.nodeValue = masked
      }
      for (const el of document.body.querySelectorAll('[title]'))
        el.setAttribute('title', swap(el.getAttribute('title')!))
      const shown = document.body.innerText.toLowerCase()
      return forbidden.filter((f) => shown.includes(f.toLowerCase()))
    },
    { pairs: masks, forbidden: [...masks.map(([real]) => real), homedir()] }
  )
  if (left.length > 0) throw new Error(`Unmasked text on the page: ${left.join(', ')}`)
}

/** Page shots: nothing focused, full page. Overlay shots: the window as it is. */
async function shot(name: string, kind: 'page' | 'overlay' = 'page'): Promise<void> {
  // No scrollbar: full-page shots keep the full 1366 px width (CSSOM, allowed by the CSP).
  await page.evaluate(() => (document.documentElement.style.scrollbarWidth = 'none'))
  await page.evaluate(() => document.fonts.ready)
  if (kind === 'page') {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.mouse.move(0, 0)
  }
  await page.waitForTimeout(300)
  await maskPage()
  await page.screenshot({
    path: join(OUT, `${name}.png`),
    fullPage: kind === 'page',
    animations: 'disabled',
    caret: 'hide',
    scale: 'css'
  })
}

async function go(route: string): Promise<void> {
  await page.evaluate((r) => (location.hash = `#${r}`), route)
  await expect(page.locator('main').first()).toBeVisible()
}

async function answerOpenDialog(path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as never
  }, path)
}

const byId = (id: string): ReturnType<Page['locator']> => page.locator(`[id="${id}"]`)
const next = (): Promise<void> => page.getByRole('button', { name: 'التالي' }).click()

test('user guide screenshots', async () => {
  test.setTimeout(300_000)

  // 01 Activation, box empty.
  await expect(page.getByTestId('activation-page')).toBeVisible()
  await expect(page.getByTestId('machine-code')).not.toBeEmpty()
  await setUpMasks()
  await shot('01-activation')

  await page.getByTestId('license-text').fill(testLicense({ customerName: demoOffice }))
  await page.getByRole('button', { name: 'تفعيل' }).click()
  await expect(page.getByRole('heading', { name: 'وثيقة نقل بري' })).toBeVisible()

  // Demo data through the API, then one backup so the home page has no warning.
  const vesselIds = await page.evaluate(
    async ({ agents, vessels, parties, drivers, tankers }) => {
      const { api } = globalThis as unknown as WithApi
      await api.settings.setCustomsAgents(agents)
      for (const p of parties) await api.lookups.createParty(p)
      for (const d of drivers) await api.lookups.createDriver(d)
      for (const t of tankers) await api.lookups.createTanker(t)
      const old = await api.vessels.create(vessels.old, { makeActive: true })
      const current = await api.vessels.create(vessels.current, { makeActive: true })
      return { old: old.id, current: current.id }
    },
    {
      agents: demoAgents,
      vessels: demoVessels,
      parties: demoParties,
      drivers: demoDrivers,
      tankers: demoTankers
    }
  )
  const backups = join(work, 'backups')
  mkdirSync(backups)
  await answerOpenDialog(backups)
  const backupFile = await page.evaluate(
    async ({ docs, old, oldId }) => {
      const { api } = globalThis as unknown as WithApi
      const ids: number[] = []
      for (const doc of docs) ids.push((await api.documents.create(doc, {})).id)
      await api.vessels.update(oldId, { ...old, isActive: false })
      // One deleted document, for the history's "show deleted" filter.
      await api.documents.softDelete(ids[1])
      await api.backup.chooseFolder()
      return (await api.backup.runNow()).lastBackupPath!
    },
    {
      docs: demoDocuments(vesselIds.old, vesselIds.current),
      old: demoVessels.old,
      oldId: vesselIds.old
    }
  )

  // 02 Home.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'وثيقة نقل بري' })).toBeVisible()
  await expect(page.getByTestId('backup-age-warning')).toHaveCount(0)
  await shot('02-home')

  // 03–07 The wizard, one step per shot, then the review.
  await go('/new')
  await byId('doc-shipperName').fill(demoParties[0].name)
  await byId('doc-shipperName').press('Tab')
  await byId('doc-consigneeName').fill(demoParties[3].name)
  await byId('doc-consigneeName').press('Tab')
  await expect(byId('doc-consigneeAddress')).toHaveValue(demoParties[3].address!)
  await shot('03-wizard-step1-parties')

  await next()
  await byId('doc-product').fill('بنزين/ Gasoline')
  await byId('doc-qtyNaturalL').fill('36000')
  await byId('doc-qtyStandardL').fill('35716')
  await byId('doc-weightKg').fill('26616')
  await byId('doc-barrels').fill('224.65')
  for (let i = 0; i < 4; i++) {
    if (i > 0) await page.getByRole('button', { name: 'إضافة ختم' }).click()
    await byId(`doc-seals.${i}.value`).fill(`S-${7440 + i}`)
  }
  await shot('04-wizard-step2-loading')

  await next()
  const quality: [string, string][] = [
    ['density15', '0.7452'],
    ['octane', '95'],
    ['flashPoint', '-43'],
    ['temperature', '27.5'],
    ['vcf', '0.9921'],
    ['meterFactor', '1.0002'],
    ['crossingNo', 'CR-2026-4108'],
    ['supplyOfficerName', 'سليم ناصر'],
    ['supplyOfficerTitle', 'مسؤول التجهيز']
  ]
  for (const [key, value] of quality) await byId(`doc-${key}`).fill(value)
  await shot('05-wizard-step3-quality')

  await next()
  await byId('doc-missionNo').fill('MF-2026/318')
  await byId('doc-supplyOrderNo').fill('SO-2026/91')
  await byId('doc-supplyOrderDate').fill('20/09/2026')
  await byId('doc-supplyOrderDate').press('Tab')
  await byId('doc-tankerNo').fill(demoTankers[2].tankerNo)
  await byId('doc-tankerNo').press('Tab')
  await byId('doc-driverName').fill(demoDrivers[1].name)
  await byId('doc-driverName').press('Tab')
  await expect(byId('doc-passportNo')).toHaveValue(demoDrivers[1].passportNo!)
  await byId('doc-carrierRep').fill('شركة الطريق السريع للنقل')
  await shot('06-wizard-step4-transport')

  await next()
  await expect(page.getByRole('button', { name: 'حفظ الوثيقة' })).toBeVisible()
  await shot('07-wizard-review')

  // 08 Saved: the serial and the actions.
  await page.getByRole('button', { name: 'حفظ الوثيقة' }).click()
  await expect(page.getByText('تم حفظ الوثيقة')).toBeVisible()
  await expect(page.getByText('P00006')).toBeVisible()
  await shot('08-saved')

  // The sample PDF, of the document just saved.
  const saved = await page.evaluate(async () => {
    const { api } = globalThis as unknown as WithApi
    return (await api.documents.list({ search: 'P00006' })).rows[0].id
  })
  const pdf = join(OUT, 'sample-document.pdf')
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as never
  }, pdf)
  expect(
    await page.evaluate((id) => (globalThis as unknown as WithApi).api.print.savePdf(id), saved)
  ).toEqual({ path: pdf })

  // 09 History, searched by shipper.
  await go('/history')
  await page.getByLabel('بحث').fill('الأفق')
  await expect(page.getByTestId('history-row')).toHaveCount(5)
  await shot('09-history-search')

  // 10 A row's actions menu.
  await page.getByRole('button', { name: 'إجراءات الوثيقة P00006' }).click()
  await expect(page.getByRole('menuitem', { name: 'نسخ كوثيقة جديدة' })).toBeVisible()
  await shot('10-history-row-menu', 'overlay')
  await page.keyboard.press('Escape')

  // 11 The document page.
  await go(`/documents/${saved}`)
  await expect(page.getByRole('button', { name: 'نسخ كوثيقة جديدة' })).toBeVisible()
  await shot('11-document')

  // 12 Duplicate as new: the wizard, prefilled.
  await page.getByRole('button', { name: 'نسخ كوثيقة جديدة' }).click()
  await expect(page.getByText('نسخة من الوثيقة')).toContainText('P00006')
  await shot('12-duplicate-as-new')

  // 13 Delete confirmation, cancelled.
  await go(`/documents/${saved}`)
  await page.getByRole('button', { name: 'حذف' }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await shot('13-delete-confirm', 'overlay')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)

  // 14–19 Settings, one shot per tab.
  const tabs = ['vessels', 'agents', 'lookups', 'backup', 'license', 'about']
  for (const [i, tab] of tabs.entries()) {
    await go(`/settings?tab=${tab}`)
    await expect(page.getByRole('tabpanel').first()).toBeVisible()
    if (tab === 'vessels') await expect(page.getByTestId('vessel-row')).toHaveCount(2)
    if (tab === 'backup') await expect(page.getByTestId('backup-last')).not.toBeEmpty()
    if (tab === 'license') await expect(page.getByTestId('license-customer')).toHaveText(demoOffice)
    if (tab === 'about') await expect(page.getByTestId('app-version')).not.toBeEmpty()
    await shot(`${14 + i}-settings-${tab}`)
  }

  // 20 Add vessel dialog, filled in, cancelled.
  await go('/settings?tab=vessels')
  await page.getByRole('button', { name: 'إضافة باخرة' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await byId('vessel-name').fill('MT Silver Wave')
  await byId('vessel-prefix').fill('W')
  await shot('20-add-vessel-dialog', 'overlay')
  await page.getByRole('button', { name: 'إلغاء' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // 21 Restore confirmation for the backup made after seeding, cancelled.
  await go('/settings?tab=backup')
  await answerOpenDialog(backupFile)
  await page.getByRole('button', { name: 'استعادة من نسخة احتياطية…' }).click()
  await expect(page.getByTestId('restore-summary')).toBeVisible()
  await shot('21-restore-confirm', 'overlay')
  await page.keyboard.press('Escape')

  console.log(['Written:', ...readdirSync(OUT).map((f) => `  ${join(OUT, f)}`)].join('\n'))
})
