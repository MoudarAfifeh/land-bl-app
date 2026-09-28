import { defineConfig } from '@playwright/test'

// Smoke test of the packaged app (`npm run test:packaged` packages it into dist-e2e/ first).
export default defineConfig({
  testDir: 'e2e-packaged',
  timeout: 120_000,
  workers: 1,
  reporter: 'list'
})
