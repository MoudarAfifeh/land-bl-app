import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      // Unit tests never run inside Electron; see src/main/test-electron.ts.
      electron: resolve('src/main/test-electron.ts'),
      '@': resolve('src/renderer/src')
    }
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tools/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['vitest.global-setup.ts'],
    // Processed by Vitest (not loaded natively) so its `electron` import gets the stub too.
    server: { deps: { inline: ['@electron-toolkit/utils'] } }
  }
})
