import { execFileSync } from 'node:child_process'
import { afterAll, describe, expect, test } from 'vitest'
import { seed } from '../../../scripts/lib/seed.mjs'
import { startExtraApp, type ExtraApp } from '../../support/app'
import { launchBrowser } from '../../support/browser'
import { sql, withDb } from '../../support/db'
import { env } from '../../support/env'
import { request } from '../../support/http'

describe('A01 Boot the platform', () => {
  test('A01.1 Chromium can start (the browser tests from A04 on need it)', async () => {
    const browser = await launchBrowser()
    await browser.close()
  })

  test('A01.2 Postgres 18 runs from compose.yaml with its data on a named volume', async () => {
    const version = await withDb(async (c) => (await c.query("select current_setting('server_version_num')::int as v")).rows[0], env.devDbUrl())
    expect(version.v, 'Postgres major version').toBeGreaterThanOrEqual(180000)
    // The owner role is an ordinary one and may not read `data_directory`; the image exports the same path as $PGDATA.
    const dir = execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'echo $PGDATA'], { cwd: env.root(), encoding: 'utf8' }).trim()
    expect(dir, 'PGDATA of the 18 image').toMatch(/^\/var\/lib\/postgresql\/18\//)
    const id = execFileSync('docker', ['compose', 'ps', '-q', 'postgres'], { cwd: env.root(), encoding: 'utf8' }).trim()
    const mounts = JSON.parse(execFileSync('docker', ['inspect', id, '--format', '{{json .Mounts}}'], { encoding: 'utf8' })) as { Type: string; Destination: string }[]
    expect(mounts.some((m) => m.Type === 'volume' && m.Destination === '/var/lib/postgresql'), `named volume mounted where the image keeps its data; mounts were ${JSON.stringify(mounts.map((m) => [m.Type, m.Destination]))}`).toBe(true)
  })

  test('A01.3 the first migration exists and the dev database has the tables', async () => {
    const tables = await withDb(async (c) => (await c.query("select table_name from information_schema.tables where table_schema = 'public'")).rows.map((r) => r.table_name as string), env.devDbUrl())
    for (const table of ['orgs', 'users', 'companies', 'contacts']) expect(tables, `table ${table} in the dev database (npm run db:generate, then npm run db:migrate)`).toContain(table)
    const applied = await withDb(async (c) => (await c.query('select count(*)::int as n from drizzle.__drizzle_migrations')).rows[0].n, env.devDbUrl())
    expect(applied).toBeGreaterThanOrEqual(1)
  })

  test('A01.4 the dev database is seeded with 10,000+ contacts across 4 organisations', async () => {
    const counts = await withDb(
      async (c) => (await c.query('select (select count(*)::int from contacts) as contacts, (select count(*)::int from orgs) as orgs, (select count(*)::int from contacts c join orgs o on o.id = c.org_id) as joined')).rows[0],
      env.devDbUrl(),
    )
    expect(counts.orgs, 'organisations').toBe(4)
    expect(counts.contacts, 'contacts (npm run db:seed)').toBeGreaterThanOrEqual(10_000)
    expect(counts.joined, 'every contact belongs to an organisation that exists').toBe(counts.contacts)
  })

  test('A01.5 the seed is deterministic: the same seed twice gives the same content', async () => {
    const checksum = () =>
      sql<{ md5: string }>(
        `select md5(string_agg(o.slug || '|' || c.name || '|' || coalesce(c.email, '') || '|' || c.created_at::text, ',' order by o.slug, c.email)) as md5
           from contacts c join orgs o on o.id = c.org_id`,
      ).then((rows) => rows[0].md5)
    await seed({ url: env.dbUrl(), scale: 'test' })
    const first = await checksum()
    await seed({ url: env.dbUrl(), scale: 'test' })
    expect(await checksum()).toBe(first)
  })

  test('A01.6 GET /api/health answers 200 with the database status and the server version', async () => {
    const response = await request('/api/health')
    expect(response.status, 'status of GET /api/health').toBe(200)
    expect(response.headers.get('content-type')).toMatch(/application\/json/)
    const body = await response.json()
    expect(body.status).toBe('ok')
    expect(body.database).toBe('up')
    expect(String(body.serverVersion), 'serverVersion comes from `show server_version`').toMatch(/^18\./)
    expect(Number.isNaN(Date.parse(body.checkedAt)), 'checkedAt is an ISO timestamp').toBe(false)
  })

  test('A01.7 the health check is computed per request, not once at build time', async () => {
    const first = await (await request('/api/health')).json()
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const second = await (await request('/api/health')).json()
    expect(second.checkedAt, 'checkedAt must change between two requests 1.2 s apart').not.toBe(first.checkedAt)
  })

  let broken: ExtraApp | undefined
  afterAll(async () => broken?.stop())

  test('A01.8 the health check says 503 / database "down" when Postgres cannot be reached', async () => {
    broken = await startExtraApp({ DATABASE_URL: 'postgres://crm:crm@127.0.0.1:1/crm' })
    const response = await request('/api/health', { base: broken.url })
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.status).toBe('error')
    expect(body.database).toBe('down')
    expect(JSON.stringify(body), 'no connection string or stack trace in the response').not.toMatch(/postgres:\/\/|ECONNREFUSED|\bat .*\.js/i)
  })
})

