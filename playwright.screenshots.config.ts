import { defineConfig } from '@playwright/test'

// User-guide screenshots of the packaged app (`npm run screenshots` packages it into dist-e2e/ first).
export default defineConfig({
  testDir: 'screenshots',
  timeout: 300_000,
  workers: 1,
  reporter: 'list'
})
