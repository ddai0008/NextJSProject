import pg from 'pg'
import { beforeAll, describe, expect, test } from 'vitest'
import type { RequestContext } from '../../../lib/dal/types'
import { sql } from '../../support/db'
import { env } from '../../support/env'
import { describePlan, planOfReplayed, recordQueries, selectsFrom } from '../../support/queries'
import { ctxOf, seeded } from '../../support/people'

// A second wall behind the data access layer. These tests do not know HOW you isolate tenants (row-level security, schemas, something else): they connect the way
// the application connects and ask what that connection can do when the access layer's own filters are not there to help.

// The pool of this process is created from this setting when db/client is first imported (it is imported dynamically below, after this line).
process.env.DB_POOL_MAX = '1'

const TENANT_TABLES = ['contacts', 'companies', 'deals', 'stages'] as const
const appClient = async () => {
  const client = new pg.Client({ connectionString: env.appDbUrl() })
  await client.connect()
  return client
}
/** What a statement did: how many rows it returned, or the error's code. */
async function attempt(client: pg.Client, text: string, values: unknown[] = []): Promise<{ rows: number } | { error: string }> {
  await client.query('begin')
  try {
    return { rows: (await client.query(text, values as any[])).rowCount ?? 0 }
  } catch (error) {
    return { error: String((error as { code?: string }).code ?? (error as Error).message) }
  } finally {
    await client.query('rollback')
  }
}

let acme: RequestContext
let kestrel: RequestContext
beforeAll(async () => {
  acme = await ctxOf(seeded.acme.rep, 'acme')
  kestrel = await ctxOf(seeded.kestrel.rep, 'kestrel')
})

describe('A09 the application connects with restricted credentials', () => {
  test('A09.2 the app\'s database user is not a superuser, cannot bypass row-level security, and does not own the tenant tables', async () => {
    const client = await appClient()
    try {
      const [who] = (await client.query('select r.rolname, r.rolsuper, r.rolbypassrls from pg_roles r where r.rolname = current_user')).rows
      expect(who.rolname, 'the runner connects the app as crm_app when that role exists: create it in a migration (login, password crm_app)').not.toBe('crm')
      expect({ superuser: who.rolsuper, bypassRls: who.rolbypassrls }, `the app's database user "${who.rolname}"`).toEqual({ superuser: false, bypassRls: false })
      for (const table of TENANT_TABLES) {
        const [owner] = (await client.query('select tableowner from pg_tables where schemaname = $1 and tablename = $2', ['public', table])).rows
        expect(owner?.tableowner, `owner of ${table}: the owner of a table is exempt from row-level security`).not.toBe(who.rolname)
      }
    } finally {
      await client.end()
    }
  })
})

describe('A09 with the application\'s credentials and no tenant context', () => {
  test('A09.3 reading any tenant table returns no rows (or fails), and writing one fails', async () => {
    for (const table of TENANT_TABLES) {
      const [{ n }] = await sql<{ n: string }>(`select count(*) as n from ${table}`)
      expect(Number(n), `${table} has rows for the owner (so "no rows" below means something)`).toBeGreaterThan(0)
    }
    const client = await appClient()
    try {
      for (const table of TENANT_TABLES) {
        const read = await attempt(client, `select * from ${table}`)
        expect('error' in read || read.rows === 0, `select * from ${table} as the app, no context: ${JSON.stringify(read)}`).toBe(true)
      }
      const write = await attempt(client, "insert into contacts (org_id, name, email) values ($1, 'Smuggled', 'smuggled@example.test')", [acme.orgId])
      expect('error' in write, `inserting a contact for any organisation as the app, no context: ${JSON.stringify(write)}`).toBe(true)
      const change = await attempt(client, "update contacts set name = 'Changed' where org_id = $1", [acme.orgId])
      expect('error' in change || change.rows === 0, `updating contacts as the app, no context: ${JSON.stringify(change)}`).toBe(true)
      const erase = await attempt(client, 'delete from contacts where org_id = $1', [acme.orgId])
      expect('error' in erase || erase.rows === 0, `deleting contacts as the app, no context: ${JSON.stringify(erase)}`).toBe(true)
    } finally {
      await client.end()
    }
  })
})

describe('A09 requests that share one pooled connection', () => {
  let dal: typeof import('../../../lib/dal/contacts') & typeof import('../../../lib/dal/deals')
  let appPool: pg.Pool
  beforeAll(async () => {
    const client = await import('../../../db/client')
    appPool = client.pool
    dal = { ...(await import('../../../lib/dal/contacts')), ...(await import('../../../lib/dal/deals')) }
  })

  const owningOrg = async (ids: string[]) => new Set((await sql<{ org_id: string }>('select distinct org_id from contacts where id = any($1)', [ids])).map((r) => r.org_id))

  test('A09.4 one request\'s tenant is not left on the connection for the next: afterwards, with no context, the app sees nothing', async () => {
    expect((appPool as unknown as { options: { max: number } }).options.max, 'the pool of this process has one connection (DB_POOL_MAX=1): every request below reuses it').toBe(1)
    const noContext = async () => {
      const result = await appPool.query('select count(*)::int as n from contacts').then((r) => ({ rows: r.rows[0].n as number }), (e) => ({ error: String(e.code ?? e.message) }))
      return result
    }
    const seesNothing = (result: { rows: number } | { error: string }) => 'error' in result || result.rows === 0

    const page = await dal.listContacts(acme, {})
    expect(page.rows.length, 'the access layer still works for Acme').toBeGreaterThan(0)
    expect([...(await owningOrg(page.rows.map((r) => r.id)))], 'every contact returned belongs to Acme').toEqual([acme.orgId])
    expect(seesNothing(await noContext()), `after a request for Acme, a statement with no context on the same connection: ${JSON.stringify(await noContext())}`).toBe(true)

    // a request that fails half way must not leave its context behind either (a rep may not change somebody else's deal)
    const [others] = await sql<{ id: string }>('select id from deals where org_id = $1 and owner_id <> $2 limit 1', [acme.orgId, acme.userId])
    await dal.updateDeal(acme, others.id, { title: 'nope' }).then(() => undefined, () => undefined)
    expect(seesNothing(await noContext()), `after a request that failed: ${JSON.stringify(await noContext())}`).toBe(true)

    // alternating tenants, queued on the single connection: each only ever sees its own
    const requests = Array.from({ length: 24 }, (_, i) => (i % 2 === 0 ? { ctx: acme, org: acme.orgId } : { ctx: kestrel, org: kestrel.orgId }))
    const pages = await Promise.all(requests.map(({ ctx }) => dal.listContacts(ctx, { sort: 'name' })))
    for (const [i, result] of pages.entries()) {
      expect([...(await owningOrg(result.rows.map((r) => r.id)))], `request ${i} (${i % 2 === 0 ? 'acme' : 'kestrel'})`).toEqual([requests[i].org])
    }
    expect(seesNothing(await noContext()), 'after the interleaved requests').toBe(true)
  })
})

describe('A09 the plan budget, as the application runs it', () => {
  test('A09.5 the contact list and the search still use an index and no sort, with the second wall in place (A03.9, measured as the app\'s user)', async () => {
    const { listContacts } = await import('../../../lib/dal/contacts')
    const ctx = await ctxOf(seeded.acme.rep, 'acme')
    const cases: [string, Parameters<typeof listContacts>[1], boolean][] = [
      ['newest first', {}, false],
      ['A to Z', { sort: 'name' }, false],
      ['search by name', { q: 'bode' }, true],
    ]
    for (const [label, query, search] of cases) {
      const { queries } = await recordQueries(() => listContacts(ctx, query))
      const selects = selectsFrom(queries, 'contacts')
      expect(selects.length, `${label}: a SELECT on contacts was sent`).toBeGreaterThan(0)
      const page = selects.find((s) => /limit/i.test(s.text)) ?? selects[0]
      const plan = await planOfReplayed(queries, queries.indexOf(page))
      const where = `${label}: ${describePlan(plan)}`
      expect(plan.some((n) => n.nodeType === 'Seq Scan' && n.relation === 'contacts'), `sequential scan of contacts (${where})`).toBe(false)
      if (!search) expect(plan.some((n) => n.nodeType === 'Sort' || n.nodeType === 'Incremental Sort'), `sort node (${where})`).toBe(false)
      else expect(plan.map((n) => n.index ?? '').some((name) => /trgm/.test(name)), `the trigram index serves the search (${where})`).toBe(true)
    }
  })
})
