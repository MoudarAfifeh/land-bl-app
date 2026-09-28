/**
 * License generator, for the developer only (docs/LICENSING.md). Run through npm:
 *
 *   npm run license -- keygen  --private-key <path outside the repo> [--force]
 *   npm run license -- issue   --private-key <path> --machine <code> --customer "<name>"
 *                              [--expires YYYY-MM-DD] [--note "<text>"] [--out <file>]
 *   npm run license -- inspect <license file>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { inspect, issue, keygen, PUBLIC_KEY_PATH } from './generator.ts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const publicKeyPath = join(repoRoot, PUBLIC_KEY_PATH)

const USAGE = `Usage:
  npm run license -- keygen  --private-key <path outside the repo> [--force]
  npm run license -- issue   --private-key <path> --machine <code> --customer "<name>"
                             [--expires YYYY-MM-DD] [--note "<text>"] [--out <file>]
  npm run license -- inspect <license file>`

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`--${name} is required.\n\n${USAGE}`)
  return value
}

function main(argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'private-key': { type: 'string' },
      machine: { type: 'string' },
      customer: { type: 'string' },
      expires: { type: 'string' },
      note: { type: 'string' },
      out: { type: 'string' },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    }
  })
  const [command, file] = positionals

  if (values.help || !command) {
    console.log(USAGE)
    return
  }

  if (command === 'keygen') {
    const result = keygen({
      privateKeyPath: resolve(required(values['private-key'], 'private-key')),
      publicKeyPath,
      repoRoot,
      force: values.force
    })
    console.log(`Private key: ${result.privateKeyPath}`)
    console.log(`Public key:  ${publicKeyPath} (commit this file)`)
    console.log(`Fingerprint: ${result.fingerprint}`)
    console.log('\nBack up the private key now, together with the log of issued licenses that')
    console.log(
      'will be written next to it (docs/LICENSING.md). Without it no license can be issued.'
    )
    return
  }

  if (command === 'issue') {
    const { text, payload, logPath } = issue({
      privateKeyPath: resolve(required(values['private-key'], 'private-key')),
      publicKeyPath,
      repoRoot,
      machine: required(values.machine, 'machine'),
      customer: required(values.customer, 'customer'),
      expires: values.expires ?? null,
      note: values.note ?? '',
      now: new Date()
    })
    if (values.out) {
      writeFileSync(resolve(values.out), `${text}\n`, 'utf8')
      console.log(`License written to ${resolve(values.out)}`)
    } else {
      console.log(text)
    }
    console.log(`\nCustomer: ${payload.customerName}`)
    console.log(`Expires:  ${payload.expiresAt ?? 'never'}`)
    console.log(`Logged in ${logPath}`)
    return
  }

  if (command === 'inspect') {
    const text = readFileSync(resolve(required(file, 'license file')), 'utf8')
    console.log(inspect(text, publicKeyPath, new Date()))
    return
  }

  throw new Error(`Unknown command "${command}".\n\n${USAGE}`)
}

try {
  main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
