import { defineConfig } from 'drizzle-kit'

// Used only by `npm run db:generate` at development time. Migrations run in the app via migrate().
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './src/main/db/migrations'
})
