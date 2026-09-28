// Run by `npm run build:win` before packaging: the built main process must carry the production
// license public key, never the committed test key (an `--mode e2e` build). See docs/LICENSING.md.
import { createPublicKey } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PRODUCTION = 'src/main/license/production-public-key.pem'
const TEST = 'e2e/fixtures/license-test-public.pem'
const MAIN_OUT = 'out/main'

const der = (file) =>
  createPublicKey(readFileSync(file)).export({ type: 'spki', format: 'der' }).toString('base64')

function fail(message) {
  console.error(`License key check failed: ${message}`)
  process.exit(1)
}

if (!existsSync(PRODUCTION)) fail(`${PRODUCTION} is missing (npm run license -- keygen).`)
if (!existsSync(MAIN_OUT)) fail(`${MAIN_OUT} is missing: build first.`)

const bundle = readdirSync(MAIN_OUT)
  .filter((name) => name.endsWith('.js'))
  .map((name) => readFileSync(join(MAIN_OUT, name), 'utf8'))
  .join('\n')

if (bundle.includes(der(TEST))) fail('the build contains the TEST key. Rebuild without --mode e2e.')
if (!bundle.includes(der(PRODUCTION))) fail('the build does not contain the production key.')
console.log('License key check: production key, OK.')
