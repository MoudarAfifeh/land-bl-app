import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import PizZip from 'pizzip'
import type { Api } from '../src/shared/api'
import { longDocument } from '../src/main/services/test-fixtures'
import { installTestLicense } from './license'

type WithApi = { api: Api }

let app: ElectronApplication
let userData: string

test.beforeAll(async () => {
  // A throwaway userData folder: the real database is never touched.
  userData = mkdtempSync(join(tmpdir(), 'land-bl-e2e-'))
  installTestLicense(userData)
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

test('exports a document with 12 seals to Excel and Word, and a cancel writes nothing', async () => {
  const page = await app.firstWindow()
  await page.waitForFunction(() => 'api' in globalThis)

  const id = await page.evaluate(async (doc) => {
    const { api } = globalThis as unknown as WithApi
    const vessel = await api.vessels.create(
      { name: 'MT Export', prefix: 'X', arrivalDate: null, isActive: true },
      { makeActive: true }
    )
    return (await api.documents.create({ ...doc, vesselId: vessel.id }, {})).id
  }, longDocument)

  // Answer the save dialog with a temp path and record the name it suggested.
  const answer = async (path: string | null): Promise<void> => {
    await app.evaluate(({ dialog }, path) => {
      const g = globalThis as unknown as { suggested: string[] }
      g.suggested = []
      dialog.showSaveDialog = (async (...args: unknown[]) => {
        const options = args[args.length - 1] as { defaultPath: string }
        g.suggested.push(options.defaultPath)
        return path ? { canceled: false, filePath: path } : { canceled: true, filePath: '' }
      }) as never
    }, path)
  }
  const suggested = (): Promise<string[]> =>
    app.evaluate(() => (globalThis as unknown as { suggested: string[] }).suggested)
  const documents = await app.evaluate(({ app }) => app.getPath('documents'))

  const xlsxPath = join(userData, 'out.xlsx')
  await answer(xlsxPath)
  expect(
    await page.evaluate((docId) => (globalThis as unknown as WithApi).api.export.excel(docId), id)
  ).toEqual({ path: xlsxPath })
  expect(await suggested()).toEqual([join(documents, 'X00001.xlsx')])
  const sheet = new PizZip(readFileSync(xlsxPath)).file('xl/worksheets/sheet1.xml')!.asText()
  expect(sheet).toContain('X00001')
  expect(sheet).toContain('SEAL-2026-1000011')

  const docxPath = join(userData, 'out.docx')
  await answer(docxPath)
  expect(
    await page.evaluate((docId) => (globalThis as unknown as WithApi).api.export.word(docId), id)
  ).toEqual({ path: docxPath })
  expect(await suggested()).toEqual([join(documents, 'X00001.docx')])
  const body = new PizZip(readFileSync(docxPath)).file('word/document.xml')!.asText()
  expect(body).toContain('X00001')
  expect(body).toContain('SEAL-2026-1000011')
  expect(body).not.toContain('{')

  await answer(null)
  expect(
    await page.evaluate((docId) => (globalThis as unknown as WithApi).api.export.word(docId), id)
  ).toBeNull()
})
