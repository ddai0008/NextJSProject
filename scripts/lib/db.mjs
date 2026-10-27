// Small helpers shared by the scripts: connecting to the Postgres cluster in compose.yaml and managing throwaway databases.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

export const CLUSTER = { host: 'localhost', port: 55432, user: 'crm', password: 'crm' }

export function urlFor(database, { user = CLUSTER.user, password = CLUSTER.password } = {}) {
  return `postgres://${user}:${password}@${CLUSTER.host}:${CLUSTER.port}/${database}`
}

export async function withClient(url, fn) {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export const withAdmin = (fn) => withClient(urlFor('postgres'), fn)

export async function databaseExists(name) {
  return withAdmin(async (c) => (await c.query('select 1 from pg_database where datname = $1', [name])).rowCount > 0)
}

export async function dropDatabase(name) {
  await withAdmin((c) => c.query(`drop database if exists "${name}" with (force)`))
}

export async function createFromTemplate(name, template) {
  await withAdmin((c) => c.query(`create database "${name}" template "${template}"`))
}

export async function roleExists(role) {
  return withAdmin(async (c) => (await c.query('select 1 from pg_roles where rolname = $1', [role])).rowCount > 0)
}

// A hash of everything the test template is built from; a new hash means a new template.
export function templateHash(root) {
  const hash = createHash('sha256')
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else hash.update(full.slice(root.length)).update(readFileSync(full))
    }
  }
  walk(join(root, 'db', 'migrations'))
  hash.update(readFileSync(join(root, 'scripts', 'lib', 'seed.mjs')))
  return hash.digest('hex').slice(0, 10)
}

/** Applies db/migrations to the database at `url` (what `npm run db:migrate` does, without drizzle-kit). */
export async function migrateDatabase(url, root) {
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const { migrate } = await import('drizzle-orm/node-postgres/migrator')
  const pool = new pg.Pool({ connectionString: url, max: 1 })
  try {
    await migrate(drizzle(pool), { migrationsFolder: join(root, 'db', 'migrations') })
    await pool.query('create extension if not exists pg_stat_statements')
  } finally {
    await pool.end()
  }
}
