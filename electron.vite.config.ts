import { createPublicKey } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve('src/shared') }

/**
 * The license public key compiled into main (src/main/license/public-key.ts). `--mode e2e`
 * (npm run test:e2e) uses the committed test key; every other build needs the production key that
 * the license generator's keygen writes. scripts/check-license-key.mjs refuses to package a build
 * with the test key.
 */
function licensePublicKey(mode: string): string {
  const file =
    mode === 'e2e'
      ? 'e2e/fixtures/license-test-public.pem'
      : 'src/main/license/production-public-key.pem'
  if (!existsSync(file)) {
    throw new Error(
      `Missing ${file}. Create the license key pair first: npm run license -- keygen (docs/LICENSING.md).`
    )
  }
  return createPublicKey(readFileSync(file))
    .export({ type: 'spki', format: 'der' })
    .toString('base64')
}

/**
 * The CSP in src/renderer/index.html refuses every connection (connect-src 'none'). The dev server's
 * hot reload needs one to itself, so `npm run dev` only relaxes it to 'self'; builds keep it.
 */
function devServerCsp(): Plugin {
  return {
    name: 'land-bl-dev-csp',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace("connect-src 'none'", "connect-src 'self'")
  }
}

export default defineConfig(({ mode }) => ({
  main: {
    resolve: { alias: shared },
    define: { __LICENSE_PUBLIC_KEY__: JSON.stringify(licensePublicKey(mode)) }
  },
  preload: {
    resolve: { alias: shared }
  },
  renderer: {
    resolve: {
      alias: { ...shared, '@': resolve('src/renderer/src') }
    },
    plugins: [react(), tailwindcss(), devServerCsp()],
    // Minified: smaller, and library comments (docs links) don't ship. scripts/check-offline.mjs
    // then reviews every URL string left in the bundle.
    build: { minify: true }
  }
}))
