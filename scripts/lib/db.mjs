// Small helpers shared by the scripts: connecting to the Postgres cluster in compose.yaml and managing throwaway databases.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

// Two kinds of role on purpose. `crm` owns the development and test databases and runs migrations and the seed: an ordinary role with CREATEDB and CREATEROLE,
// like the administrator of a managed Postgres, NOT a superuser (a superuser bypasses row-level security and can do things a real owner cannot, so tests that
// pass as one can fail in production). `postgres` is the superuser the container is created with; the tooling uses it only for what genuinely needs one.
export const CLUSTER = { host: 'localhost', port: 55432, user: 'crm', password: 'crm' }
export const SUPERUSER = { user: 'postgres', password: 'postgres' }

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

/**
 * Makes sure the cluster has the roles and the development database the rest of the tooling expects. It is the only caller of the superuser, and it is idempotent:
 *  - role `crm`: LOGIN, CREATEDB, CREATEROLE, not a superuser (it creates databases, and migration 0004 creates the application's role);
 *  - `crm` is a member of pg_read_all_stats (the tests read pg_stat_statements for every role's queries) and of pg_signal_backend (it may end the sessions of the
 *    application's role when it drops a throwaway database);
 *  - database `crm`, owned by `crm`.
 */
export async function ensureCluster() {
  let client
  try {
    client = new pg.Client({ connectionString: urlFor('postgres', SUPERUSER) })
    await client.connect()
  } catch (error) {
    if (['28P01', '28000'].includes(error.code)) {
      throw new Error(
        'The Postgres container does not have the superuser "postgres": its data volume was created by an older compose.yaml (one that made `crm` the superuser). ' +
          'Run `docker compose down -v` (this deletes the development database, nothing else), then `npm run db:up` again.',
      )
    }
    throw error
  }
  try {
    const existing = (await client.query("select rolsuper, rolbypassrls from pg_roles where rolname = 'crm'")).rows[0]
    if (!existing) await client.query("create role crm login password 'crm' createdb createrole")
    else if (existing.rolsuper || existing.rolbypassrls) {
      throw new Error('The role `crm` is a superuser or bypasses row-level security, which this repository no longer allows. Run `docker compose down -v`, then `npm run db:up` again.')
    }
    await client.query('grant pg_read_all_stats, pg_signal_backend to crm')
    if (!(await client.query("select 1 from pg_database where datname = 'crm'")).rowCount) await client.query('create database crm owner crm')
  } finally {
    await client.end()
  }
  await prepareDatabase('crm')
}

/** The steps for one database that need a superuser: the statistics extension that the query-count tests read, and the right to reset it. Run after the database exists. */
export async function prepareDatabase(name) {
  await withClient(urlFor(name, SUPERUSER), async (c) => {
    await c.query('create extension if not exists pg_stat_statements')
    await c.query('grant execute on function pg_stat_statements_reset(oid, oid, bigint, boolean) to crm')
  })
}

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
  } finally {
    await pool.end()
  }
}
