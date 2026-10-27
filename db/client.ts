import 'server-only'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { databaseUrl } from './config'
import * as schema from './schema'

// One pool per process. In `next dev` modules are re-evaluated on every edit, so the pool lives on globalThis.
const globalForDb = globalThis as unknown as { __crmPool?: Pool }

export const pool = (globalForDb.__crmPool ??= new Pool({
  connectionString: databaseUrl(),
  // Without a timeout, a database that never answers makes every request wait forever.
  connectionTimeoutMillis: 5_000,
  // The activity tests set DB_POOL_MAX=1 to prove that nothing leaks from one request to the next on a shared connection.
  max: Number(process.env.DB_POOL_MAX ?? 10),
}))

export const db = drizzle(pool, { schema })
