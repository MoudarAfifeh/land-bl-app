// The packaged app makes no network requests (CLAUDE.md, hard constraints). Run by `build:win` and
// `test:packaged` on `out/`, and again by scripts/after-pack.mjs on the files inside app.asar:
// - main and preload contain no http(s) URL at all;
// - every URL string left in the minified renderer is on the list below, each with the reason it
//   is never fetched. A new one fails the build until it is reviewed and added;
// - the renderer's Content-Security-Policy refuses remote requests.
// Two runtime guards back this up: the CSP itself, and main cancelling any request that isn't a
// bundled file (windows.ts, blockRemoteRequests).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

/** URL strings allowed in the renderer bundle, matched as prefixes. None of them is fetched. */
const ALLOWED = [
  // XML namespace names (React DOM, SVG icons): identifiers, not addresses.
  ['http://www.w3.org/2000/svg', 'SVG namespace'],
  ['http://www.w3.org/1999/xhtml', 'XHTML namespace'],
  ['http://www.w3.org/1999/xlink', 'XLink namespace'],
  ['http://www.w3.org/1998/Math/MathML', 'MathML namespace'],
  ['http://www.w3.org/XML/1998/namespace', 'XML namespace'],
  // JSON Schema dialect ids in zod's toJSONSchema (not used by the app).
  ['http://json-schema.org/draft-04/schema#', 'JSON Schema id'],
  ['http://json-schema.org/draft-07/schema#', 'JSON Schema id'],
  ['https://json-schema.org/draft/2020-12/schema', 'JSON Schema id'],
  // A base for parsing relative paths with `new URL()` (react-router); nothing is requested.
  ['http://localhost', 'URL parsing base'],
  // zod's URL validator builds this to check an IPv6 host.
  ['http://[${', 'zod hostname check'],
  // Links inside error message text.
  ['https://reactjs.org/docs/error-decoder.html', 'React error message'],
  ['https://reactrouter.com/en/main/routers/picking-a-router', 'react-router error message'],
  [
    'https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md',
    'date-fns error message'
  ],
  ['https://github.com/ungap/url-search-params', 'polyfill error message']
]

/** Directives the CSP must contain as is. `default-src 'self'` covers what isn't listed. */
const REQUIRED_CSP = [
  "default-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "worker-src 'none'"
]

const URL_PATTERN = /https?:\/\/[^\s"'`)<>\\]*/g
const TEXT_FILE = /\.(js|mjs|cjs|css|html)$/

/** Every URL in the files that isn't allowed, as `file: url`. */
export function remoteUrls(files, { allowList }) {
  const found = []
  for (const { name, text } of files) {
    for (const [url] of text.matchAll(URL_PATTERN)) {
      if (allowList && ALLOWED.some(([prefix]) => url.startsWith(prefix))) continue
      found.push(`${name}: ${url}`)
    }
  }
  return found
}

/** What's wrong with the CSP of the renderer's index.html, if anything. */
export function cspProblems(html) {
  const match = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/)
  if (!match) return ['index.html has no Content-Security-Policy']
  const directives = match[1].split(';').map((d) => d.trim())
  const problems = REQUIRED_CSP.filter((d) => !directives.includes(d)).map((d) => `missing ${d}`)
  if (/https?:|\*|ws:/.test(match[1])) problems.push(`allows a remote source: ${match[1]}`)
  return problems
}

/** Checks the three bundles. `files(dir)` lists a bundle's text files as { name, text }. */
export function checkBundles(files) {
  const problems = [
    ...remoteUrls(files('main'), { allowList: false }),
    ...remoteUrls(files('preload'), { allowList: false }),
    ...remoteUrls(files('renderer'), { allowList: true })
  ].map((p) => `URL ${p}`)
  const index = files('renderer').find((f) => f.name.endsWith('renderer/index.html'))
  problems.push(...(index ? cspProblems(index.text) : ['renderer/index.html is missing']))
  return problems
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

/** The text files under out/<bundle>. */
export function outFiles(root) {
  return (bundle) =>
    walk(join(root, bundle))
      .filter((path) => TEXT_FILE.test(path))
      .map((path) => ({
        name: relative(root, path).replaceAll('\\', '/'),
        text: readFileSync(path, 'utf8')
      }))
}

export function report(where, problems) {
  if (problems.length === 0) {
    console.log(`Offline check (${where}): OK.`)
    return true
  }
  console.error(`Offline check failed (${where}):`)
  for (const p of problems) console.error(`  ${p}`)
  console.error(
    'Remove the URL, or add it to ALLOWED in scripts/check-offline.mjs with the reason.'
  )
  return false
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!report('out/', checkBundles(outFiles('out')))) process.exit(1)
}
