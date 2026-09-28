// Run by `npm run build:win` before packaging: the built main process must carry the production
// license public key, never the committed test key (an `--mode e2e` build). See docs/LICENSING.md.
// scripts/after-pack.mjs checks the packaged copy again with `licenseKeyIn`.
import { createPublicKey } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PRODUCTION = join(ROOT, 'src/main/license/production-public-key.pem')
const TEST = join(ROOT, 'e2e/fixtures/license-test-public.pem')
const MAIN_OUT = join(ROOT, 'out/main')

const der = (file) =>
  createPublicKey(readFileSync(file)).export({ type: 'spki', format: 'der' }).toString('base64')

/** Which key a built main bundle carries: 'production', 'test', or null (neither: broken build). */
export function licenseKeyIn(bundle) {
  if (bundle.includes(der(TEST))) return 'test'
  if (existsSync(PRODUCTION) && bundle.includes(der(PRODUCTION))) return 'production'
  return null
}

function fail(message) {
  console.error(`License key check failed: ${message}`)
  process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!existsSync(PRODUCTION)) fail(`${PRODUCTION} is missing (npm run license -- keygen).`)
  if (!existsSync(MAIN_OUT)) fail(`${MAIN_OUT} is missing: build first.`)

  const bundle = readdirSync(MAIN_OUT)
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(MAIN_OUT, name), 'utf8'))
    .join('\n')

  const key = licenseKeyIn(bundle)
  if (key === 'test') fail('the build contains the TEST key. Rebuild without --mode e2e.')
  if (key !== 'production') fail('the build does not contain the production key.')
  console.log('License key check: production key, OK.')
}
