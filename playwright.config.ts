import { defineConfig } from '@playwright/test'

// Electron smoke tests. They run the built app (`npm run test:e2e` builds first).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list'
})
