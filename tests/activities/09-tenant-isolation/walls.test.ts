import pg from 'pg'
import { beforeAll, describe, expect, test } from 'vitest'
import type { RequestContext } from '../../../lib/dal/types'
import { sql } from '../../support/db'
import { env } from '../../support/env'
import { describePlan, outcomeReplayed, planOfReplayed, recordQueries, selectsFrom } from '../../support/queries'
import { request, signIn } from '../../support/http'
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
  test('A09.2 the app\'s database user (the one the RUNNING app connects with) is not a superuser, cannot bypass row-level security, and does not own the tenant tables', async () => {
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

    // The role above is the one in the URL the runner hands out. What matters is the one the RUNNING app (a separate process) uses, so ask the database who is connected
    // after the app has served a request that reads it.
    const person = await signIn('acme', 'rep')
    expect((await request('/acme/contacts', { cookie: person.cookie })).status, 'the app answers').toBeLessThan(500)
    const sessions = await sql<{ usename: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `select a.usename, r.rolsuper, r.rolbypassrls
         from pg_stat_activity a join pg_roles r on r.rolname = a.usename
        where a.datname = current_database() and a.pid <> pg_backend_pid() and a.backend_type = 'client backend'
        group by 1, 2, 3`,
    )
    expect(sessions.length, 'connections to the database besides this test\'s own: the running app keeps a pool open').toBeGreaterThan(0)
    const owners = new Set((await sql<{ tableowner: string }>("select distinct tableowner from pg_tables where schemaname = 'public' and tablename = any($1)", [[...TENANT_TABLES]])).map((r) => r.tableowner))
    for (const s of sessions) {
      expect(owners.has(s.usename), `the running app (or a pool in this process) is connected as "${s.usename}", which owns a tenant table`).toBe(false)
      expect({ superuser: s.rolsuper, bypassRls: s.rolbypassrls }, `connected as "${s.usename}"`).toEqual({ superuser: false, bypassRls: false })
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
  test('A09.5 the contact list and the search never read the whole table: they use an index (and the list no sort), measured as the app\'s user with the context in place', async () => {
    // Plans are only comparable between runs if the planner has statistics: the seed ends with VACUUM (ANALYZE), and the cloned test database carries the result.
    const [stats] = await sql<{ tuples: number; columns: string }>(
      `select (select reltuples from pg_class where relname = 'contacts' and relkind = 'r')::float8 as tuples,
              (select count(*) from pg_stats where schemaname = 'public' and tablename = 'contacts' and attname = 'org_id') as columns`,
    )
    expect(Number(stats.tuples) > 0 && Number(stats.columns) > 0, 'the planner has statistics for contacts (the seed runs VACUUM (ANALYZE)); without them a plan depends on when autovacuum happened to run').toBe(true)

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
      // In a bitmap plan the index is named on a child node that has no table, so ask the catalog which table each index in the plan belongs to.
      const used = plan.map((n) => n.index).filter((name): name is string => Boolean(name))
      const onContacts = used.length ? await sql<{ indexname: string }>("select indexname from pg_indexes where tablename = 'contacts' and indexname = any($1)", [used]) : []
      expect(onContacts.length, `an index on contacts is used (${where})`).toBeGreaterThan(0)
      // The search may sort (it filters the organisation's rows first); the list may not.
      if (!search) expect(plan.some((n) => n.nodeType === 'Sort' || n.nodeType === 'Incremental Sort'), `sort node (${where})`).toBe(false)
    }
  })
})

describe('A09 no side channel through errors', () => {
  test('A09.6 a search pattern that is malformed gives the same answer whether or not ANOTHER tenant has rows that match it', async () => {
    // Why this test exists: LIKE raises "pattern must not end with escape character" while it MATCHES, which happens only for text that contains what comes before the
    // trailing backslash. If the database evaluates the search on another tenant's rows before it applies the isolation rule, then for a pattern such as '%secret\' the answer
    // "error" versus "no rows" tells a stranger whether any other tenant has the word. The access layer escapes search terms, but the second wall must hold when the first one
    // does not, so the probe sends the hostile pattern straight to the database as the app's user, after replaying what the DAL did on its connection to name the tenant.
    const { listContacts } = await import('../../../lib/dal/contacts')
    const token = `zq${Date.now().toString(36)}x`
    const [row] = await sql<{ id: string }>("insert into contacts (org_id, owner_id, name, email) values ($1, $2, $3, $4) returning id", [acme.orgId, acme.userId, `${token}mark Secretperson`, `${token}.secret@example.test`])
    try {
      const placeholder = 'probeterm'
      const { queries } = await recordQueries(() => listContacts(kestrel, { q: placeholder }))
      const target = queries.findIndex((q) => /limit/i.test(q.text) && selectsFrom([q], 'contacts').length > 0)
      expect(target, 'the DAL sent a search SELECT').toBeGreaterThanOrEqual(0)
      const original = queries[target].values
      expect(original.some((v) => typeof v === 'string' && v.includes(placeholder)), 'the search term reaches the database as a parameter').toBe(true)
      const withPattern = (pattern: string) => original.map((v) => (typeof v === 'string' && v.includes(placeholder) ? pattern : v))
      const present = await outcomeReplayed(queries, target, { values: withPattern(`%${token}mark\\`) }) // the word exists only in ACME's contact, followed by more text
      const absent = await outcomeReplayed(queries, target, { values: withPattern('%qqqqnonexistent\\') }) // the word exists nowhere
      expect(present, 'a Kestrel member probing for a word that only Acme has, versus one that nobody has').toEqual(absent)
    } finally {
      await sql('delete from contacts where id = $1', [row.id])
    }
  })
})
