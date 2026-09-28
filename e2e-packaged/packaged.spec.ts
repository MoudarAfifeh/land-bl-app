/**
 * Smoke test of the packaged app (npm run test:packaged): the exe electron-builder made in
 * dist-e2e/, with the test license key, never the shipped installer. Proves what only packaging can
 * break: better-sqlite3 loading from app.asar.unpacked, templates and migrations read from
 * process.resourcesPath, the bundled UI, fonts and logo, and printing to PDF.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import Database from 'better-sqlite3'
import PizZip from 'pizzip'
import type { Api } from '../src/shared/api'
import { longDocument } from '../src/main/services/test-fixtures'
import { testLicense } from '../e2e/license'

type WithApi = { api: Api }

const APP_DIR = resolve('dist-e2e/win-unpacked')
const EXE = join(APP_DIR, 'land-bl.exe')

let app: ElectronApplication
let work: string
let userData: string

test.beforeAll(async () => {
  if (!existsSync(EXE)) throw new Error(`${EXE} is missing: run npm run build:test-package`)
  work = mkdtempSync(join(tmpdir(), 'land-bl-packaged-'))
  userData = join(work, 'userData')
  app = await electron.launch({ executablePath: EXE, args: [`--user-data-dir=${userData}`] })
})

test.afterAll(async () => {
  await app?.close()
  rmSync(work, { recursive: true, force: true })
})

/** Answers the next save dialog with `path`. */
async function answerSaveDialog(path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as never
  }, path)
}

test('activate, create a document, save PDF, Excel and Word, back up', async () => {
  const runtime = await app.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    resources: process.resourcesPath,
    version: app.getVersion()
  }))
  expect(runtime.packaged).toBe(true)
  expect(runtime.resources).toBe(join(APP_DIR, 'resources'))

  // Activation through the screen, as a client does it.
  const page = await app.firstWindow()
  await expect(page.getByTestId('activation-page')).toBeVisible()
  await expect(page.getByTestId('app-version')).toHaveText(runtime.version)
  await page.getByTestId('license-text').fill(testLicense())
  await page.getByRole('button', { name: 'تفعيل' }).click()
  await expect(page.getByRole('heading', { name: 'وثيقة نقل بري' })).toBeVisible()

  // A vessel and a document: the database (better-sqlite3 + migrations) works when packaged.
  const created = await page.evaluate(async (doc) => {
    const { api } = globalThis as unknown as WithApi
    const vessel = await api.vessels.create(
      { name: 'MT Packaged', prefix: 'P', arrivalDate: null, isActive: true },
      { makeActive: true }
    )
    return api.documents.create({ ...doc, vesselId: vessel.id }, {})
  }, longDocument)
  expect(created.serialNo).toBe('P00001')

  const call = (what: 'pdf' | 'excel' | 'word', id: number): Promise<{ path: string } | null> =>
    page.evaluate(
      ([w, docId]) => {
        const { api } = globalThis as unknown as WithApi
        if (w === 'pdf') return api.print.savePdf(docId)
        return w === 'excel' ? api.export.excel(docId) : api.export.word(docId)
      },
      [what, id] as const
    )

  const pdf = join(work, 'P00001.pdf')
  await answerSaveDialog(pdf)
  expect(await call('pdf', created.id)).toEqual({ path: pdf })
  expect(readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-')
  expect(statSync(pdf).size).toBeGreaterThan(10_000)

  const xlsx = join(work, 'P00001.xlsx')
  await answerSaveDialog(xlsx)
  expect(await call('excel', created.id)).toEqual({ path: xlsx })
  const sheet = new PizZip(readFileSync(xlsx)).file('xl/worksheets/sheet1.xml')?.asText()
  expect(sheet).toContain('P00001')

  const docx = join(work, 'P00001.docx')
  await answerSaveDialog(docx)
  expect(await call('word', created.id)).toEqual({ path: docx })
  const body = new PizZip(readFileSync(docx)).file('word/document.xml')?.asText()
  expect(body).toContain('P00001')

  // A backup into a chosen folder, readable as SQLite with the document in it.
  const backups = join(work, 'backups')
  mkdirSync(backups)
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as never
  }, backups)
  const status = await page.evaluate(async () => {
    const { api } = globalThis as unknown as WithApi
    await api.backup.chooseFolder()
    return api.backup.runNow()
  })
  expect(status.lastError).toBeNull()
  const files = readdirSync(backups).filter((f) => /^land-bl_.*\.sqlite$/.test(f))
  expect(files).toHaveLength(1)
  const copy = new Database(join(backups, files[0]), { readonly: true })
  try {
    expect(copy.prepare('select serial_no from documents').all()).toEqual([{ serial_no: 'P00001' }])
  } finally {
    copy.close()
  }

  // The log file, with the packaged startup line.
  const log = readFileSync(join(userData, 'logs', 'main.log'), 'utf8')
  expect(log).toMatch(
    new RegExp(`INFO Started ${runtime.version.replaceAll('.', '\\.')} \\(packaged`)
  )
  expect(log).not.toMatch(/ ERROR /)
})
