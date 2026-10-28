#!/usr/bin/env node
// npm run db:up                           start Postgres (docker compose) and make sure the roles and the dev database `crm` exist
// npm run db:migrate                      apply db/migrations to the dev database (shows Postgres's own error if one fails)
// npm run db:reset                          drop the dev database `crm`, re-create it, apply the migrations, load the full seed
// npm run db:grant -- <email> <org> <role>  make an existing user a member of an organisation (role: admin | manager | rep)
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { seed } from './lib/seed.mjs'
import { dropDatabase, ensureCluster, migrateDatabase, prepareDatabase, urlFor, withAdmin, withClient } from './lib/db.mjs'

const root = resolve(import.meta.dirname, '..')
const [command, ...args] = process.argv.slice(2)

async function up() {
  const result = spawnSync('docker', ['compose', 'up', '-d', '--wait', 'postgres'], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) throw new Error('Could not start Postgres (docker compose up --wait). Read the container\'s own explanation with: docker compose logs postgres')
  await ensureCluster()
  console.log('Postgres is up. The roles `crm` (owner, not a superuser) and `postgres` (superuser, used only by this tooling) and the database `crm` exist.')
}

async function reset() {
  await up()
  if (!existsSync(join(root, 'db', 'migrations', 'meta', '_journal.json'))) {
    throw new Error('There are no migrations yet. Generate the first one with: npm run db:generate')
  }
  await dropDatabase('crm')
  await withAdmin((c) => c.query('create database crm'))
  await prepareDatabase('crm')
  await migrateDatabase(urlFor('crm'), root)
  console.log('Migrated. Seeding (full size, about 20 s)...')
  console.log('Seeded:', JSON.stringify(await seed({ url: urlFor('crm'), scale: 'full' })))
}

// drizzle-kit's own `migrate` exits with status 1 and prints nothing about why. This runs the same migrations through drizzle's
// migrator and prints what Postgres said. All pending migrations run in ONE transaction: if one fails, none of them is applied.
async function migrate() {
  try {
    await ensureCluster()
    await migrateDatabase(urlFor('crm'), root)
    console.log('Migrations applied to the development database "crm".')
  } catch (error) {
    const cause = error.cause ?? error
    console.error(`Migration failed: ${cause.message}${cause.code ? ` (SQLSTATE ${cause.code})` : ''}`)
    if (cause.hint) console.error(`Postgres hint: ${cause.hint}`)
    console.error('Nothing was applied: pending migrations run in one transaction. The SQL drizzle-kit generates is a draft: read the file that failed.')
    throw new Error('migration failed')
  }
}

async function grant() {
  const [email, orgSlug, role] = args
  if (!email || !orgSlug || !['admin', 'manager', 'rep'].includes(role)) throw new Error('usage: npm run db:grant -- <email> <org slug> <admin|manager|rep>')
  await withClient(urlFor('crm'), async (c) => {
    const user = (await c.query('select id from users where email = $1', [email])).rows[0]
    const org = (await c.query('select id from orgs where slug = $1', [orgSlug])).rows[0]
    if (!user) throw new Error(`No user with email ${email}. Register one first (A05).`)
    if (!org) throw new Error(`No organisation "${orgSlug}". Known: kestrel, acme, lumen, harbor.`)
    await c.query('insert into memberships (org_id, user_id, role) values ($1, $2, $3) on conflict do nothing', [org.id, user.id, role])
    console.log(`${email} is now ${role} of ${orgSlug}.`)
  })
}

try {
  if (command === 'up') await up()
  else if (command === 'migrate') await migrate()
  else if (command === 'reset') await reset()
  else if (command === 'grant') await grant()
  else throw new Error('usage: node scripts/db.mjs <up | migrate | reset | grant>')
} catch (error) {
  console.error(String(error.message ?? error))
  process.exit(1)
}
