import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import type { Api } from '../src/shared/api'
import { sampleDocument } from '../src/main/services/test-fixtures'

type WithApi = { api: Api }

let userData: string
let backupFolder: string
let apps: ElectronApplication[] = []

/** The restore exits without relaunching (LAND_BL_NO_RELAUNCH): the test starts the app again. */
async function launch(): Promise<ElectronApplication> {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: { ...process.env, LAND_BL_NO_RELAUNCH: '1' }
  })
  apps.push(app)
  return app
}

/** Answers the next folder or file dialog with `path`. */
async function answerOpenDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as never
  }, path)
}

test.beforeAll(() => {
  userData = mkdtempSync(join(tmpdir(), 'land-bl-e2e-'))
  backupFolder = mkdtempSync(join(tmpdir(), 'land-bl-e2e-backups-'))
})

test.afterAll(async () => {
  for (const app of apps) {
    await app
      .evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows()) w.destroy()
      })
      .catch(() => undefined)
    await app.close().catch(() => undefined)
  }
  apps = []
  rmSync(userData, { recursive: true, force: true })
  rmSync(backupFolder, { recursive: true, force: true })
})

test('back up, delete a document, restore: it is back and numbering continues', async () => {
  let app = await launch()
  let page = await app.firstWindow()
  await page.waitForFunction(() => 'api' in globalThis)

  const ids = await page.evaluate(async (doc) => {
    const { api } = globalThis as unknown as WithApi
    const vessel = await api.vessels.create(
      { name: 'MT Restore', prefix: 'R', arrivalDate: null, isActive: true },
      { makeActive: true }
    )
    const out: number[] = []
    for (let i = 0; i < 3; i++)
      out.push((await api.documents.create({ ...doc, vesselId: vessel.id }, {})).id)
    return out
  }, sampleDocument(0))

  // No backup yet: the home page says so.
  await page.evaluate(() => (location.hash = '#/'))
  await expect(page.getByTestId('backup-age-warning')).toBeVisible()

  // Choose the folder and back up from Settings.
  await page.getByRole('link', { name: 'النسخ الاحتياطي' }).click()
  await answerOpenDialog(app, backupFolder)
  await page.getByRole('button', { name: 'تغيير المجلد' }).click()
  await expect(page.getByTestId('backup-folder')).toHaveText(backupFolder)
  await page.getByRole('button', { name: 'نسخ احتياطي الآن' }).click()
  await expect(page.getByText('تم إنشاء النسخة الاحتياطية.')).toBeVisible()
  await expect(page.getByTestId('backup-age-warning')).toHaveCount(0)
  const backupFile = await page.evaluate(
    async () => (await (globalThis as unknown as WithApi).api.backup.status()).lastBackupPath!
  )
  expect(backupFile.startsWith(backupFolder)).toBe(true)

  // Delete the second document after the backup.
  await page.evaluate(
    (id) => (globalThis as unknown as WithApi).api.documents.softDelete(id),
    ids[1]
  )

  // Restore: the summary shows the backup's content before confirming.
  await answerOpenDialog(app, backupFile)
  await page.getByRole('button', { name: 'استعادة من نسخة احتياطية…' }).click()
  const summary = page.getByTestId('restore-summary')
  await expect(summary).toContainText('3')
  await expect(summary).toContainText('R00003')
  await expect(page.getByTestId('restore-next-serials')).toContainText('R00004')
  await expect(page.getByTestId('restore-removed')).toHaveCount(0)
  const closed = app.waitForEvent('close')
  await page.getByRole('button', { name: 'استعادة وإعادة التشغيل' }).click()
  await closed

  // A safety backup of the data before the restore was written first.
  expect(readdirSync(backupFolder).some((f) => f.startsWith('land-bl_before-restore_'))).toBe(true)
  expect(existsSync(backupFile)).toBe(true)

  // Start again on the restored data.
  app = await launch()
  page = await app.firstWindow()
  await page.waitForFunction(() => 'api' in globalThis)
  const after = await page.evaluate(
    async ([deletedId, doc]) => {
      const { api } = globalThis as unknown as WithApi
      const restored = await api.documents.get(deletedId)
      const vessel = (await api.vessels.getActive())!
      const next = await api.documents.create({ ...doc, vesselId: vessel.id }, {})
      const list = await api.documents.list({})
      return { deletedAt: restored.deletedAt, next: next.serialNo, total: list.total }
    },
    [ids[1], sampleDocument(0)] as const
  )
  expect(after).toEqual({ deletedAt: null, next: 'R00004', total: 4 })

  await page.evaluate(() => (location.hash = '#/history'))
  await expect(page.getByTestId('history-row')).toHaveCount(4)
})
