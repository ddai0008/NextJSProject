import { defineConfig } from 'drizzle-kit'
import { migrationDatabaseUrl } from './db/config'

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema/index.ts',
  out: './db/migrations',
  dbCredentials: { url: migrationDatabaseUrl() },
})
