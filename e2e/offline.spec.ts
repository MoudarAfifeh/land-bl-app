import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { installTestLicense } from './license'

// Remote requests are refused before any network access, so this runs the same with no internet.
const REMOTE = 'https://example.com/'

let app: ElectronApplication
let userData: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'land-bl-e2e-offline-'))
  installTestLicense(userData)
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

test('the renderer CSP refuses remote requests', async () => {
  const page = await app.firstWindow()
  await page.waitForFunction(() => 'api' in globalThis)

  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content')
  expect(csp).toContain("connect-src 'none'")
  expect(csp).toContain("default-src 'self'")

  const result = await page.evaluate(async (url) => {
    const violations: string[] = []
    document.addEventListener('securitypolicyviolation', (e) =>
      violations.push(`${e.effectiveDirective} ${e.blockedURI}`)
    )
    const fetched = await fetch(url).then(
      () => 'loaded',
      () => 'refused'
    )
    const image = await new Promise<string>((resolve) => {
      const img = new Image()
      img.onload = () => resolve('loaded')
      img.onerror = () => resolve('refused')
      img.src = `${url}logo.png`
    })
    // Violation events are dispatched asynchronously.
    await new Promise((resolve) => setTimeout(resolve, 100))
    return { fetched, image, violations }
  }, REMOTE)

  expect(result.fetched).toBe('refused')
  expect(result.image).toBe('refused')
  expect(result.violations).toEqual([`connect-src ${REMOTE}`, `img-src ${REMOTE}logo.png`])
})

test('main cancels requests that are not bundled files, and logs them', async () => {
  const error = await app.evaluate(async ({ session }, url) => {
    try {
      await session.defaultSession.fetch(url)
      return 'loaded'
    } catch (e) {
      return String(e)
    }
  }, REMOTE)
  expect(error).toContain('ERR_BLOCKED_BY_CLIENT')
  expect(readFileSync(join(userData, 'logs', 'main.log'), 'utf8')).toContain(
    `WARN Blocked request: ${REMOTE}`
  )
})
