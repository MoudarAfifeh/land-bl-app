// electron-builder afterPack hook (electron-builder.yml): checks the packaged app before the
// installer is made. Fails the build when:
// - app.asar holds developer-only files: tools/, e2e/, src/, keys, licenses, the issued log;
// - templates, migrations or the better-sqlite3 prebuild are missing;
// - the packaged bundles fail the offline check (scripts/check-offline.mjs);
// - the license key doesn't fit the build: the test key only in a --dir build into dist-e2e
//   (npm run test:packaged), the production key everywhere else.
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import asar from '@electron/asar'
import { licenseKeyIn } from './check-license-key.mjs'
import { checkBundles, report } from './check-offline.mjs'

/** Output folder of the packaged smoke test's test-key build (package.json, test:packaged). */
export const TEST_OUTPUT = 'dist-e2e'

/** Paths in app.asar (forward slashes, no leading slash) that must never ship. */
const FORBIDDEN = [
  [/^(tools|e2e|src|scripts|docs|test-output|templates)\//, 'developer folder'],
  [/\.(pem|key|lic)$/, 'key or license file'],
  [/(^|\/)issued-licenses\.csv$/, 'issued licenses log'],
  [/^node_modules\/better-sqlite3\/(deps|src)\//, 'better-sqlite3 sources']
]

export default async function afterPack(context) {
  const resources = join(context.appOutDir, 'resources')
  const archive = join(resources, 'app.asar')
  // listPackage gives `\out\main\index.js`; extractFile wants the same path without the first `\`.
  const inArchive = new Map(
    asar
      .listPackage(archive, { isPack: false })
      .map((p) => [p.replaceAll('\\', '/').replace(/^\//, ''), p.replace(/^[\\/]/, '')])
  )
  const files = [...inArchive.keys()]
  const problems = []

  for (const path of files) {
    for (const [pattern, what] of FORBIDDEN) {
      if (pattern.test(path)) problems.push(`app.asar contains a ${what}: ${path}`)
    }
  }

  const required = [
    join(resources, 'templates/land-bl.xlsx'),
    join(resources, 'templates/land-bl.docx'),
    join(resources, 'app.asar.unpacked/node_modules/better-sqlite3/prebuilds/win32-x64.node')
  ]
  const journal = join(resources, 'migrations/meta/_journal.json')
  if (existsSync(journal)) {
    for (const { tag } of JSON.parse(readFileSync(journal, 'utf8')).entries) {
      required.push(join(resources, `migrations/${tag}.sql`))
    }
  } else {
    required.push(journal)
  }
  for (const path of required) if (!existsSync(path)) problems.push(`missing ${path}`)

  // The packaged bundles, as the offline check reads them.
  const text = (path) => asar.extractFile(archive, inArchive.get(path)).toString('utf8')
  const bundle = (name) =>
    files
      .filter((p) => p.startsWith(`out/${name}/`) && /\.(js|mjs|cjs|css|html)$/.test(p))
      .map((p) => ({ name: p.slice('out/'.length), text: text(p) }))
  const offline = checkBundles(bundle)

  const main = bundle('main')
    .map((f) => f.text)
    .join('\n')
  const key = licenseKeyIn(main)
  const testBuild = basename(context.outDir) === TEST_OUTPUT
  const installer = context.targets.some((t) => t.name !== 'dir')
  if (key === null) problems.push('the packaged main has no license key')
  if (key === 'test' && (!testBuild || installer)) {
    problems.push(`the TEST license key may only be packaged with --dir into ${TEST_OUTPUT}/`)
  }
  if (key === 'production' && testBuild) {
    problems.push(`${TEST_OUTPUT}/ is for the test-key build (npm run test:packaged)`)
  }

  const offlineOk = report('app.asar', offline)
  if (problems.length > 0 || !offlineOk) {
    for (const p of problems) console.error(`  ${p}`)
    throw new Error('Packaged app check failed (scripts/after-pack.mjs)')
  }
  console.log(`Packaged app check: OK (${key} license key, ${files.length} files in app.asar).`)
}
