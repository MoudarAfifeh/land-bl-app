// Loads better-sqlite3 inside Electron's own Node runtime and runs a query.
// better-sqlite3 ships N-API prebuilds, which are ABI-stable, so no rebuild for Electron is needed;
// this check fails loudly if a future version or dependency breaks that.
import { spawnSync } from 'node:child_process'
import electron from 'electron'

const code = `
  const Database = require('better-sqlite3')
  const row = new Database(':memory:').prepare('select sqlite_version() as v').get()
  console.log('better-sqlite3 OK in Electron ' + process.versions.electron + ', SQLite ' + row.v)
`
const r = spawnSync(electron, ['-e', code], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit'
})
process.exit(r.status ?? 1)
