import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { ContactPage, ContactQuery } from '../../../lib/dal/contacts'
import type { RequestContext } from '../../../lib/dal/types'
import { smallestOrg, sql } from '../../support/db'
import { contextFor, expectedOrder } from '../../support/contacts'
import { describePlan, planOf, recordQueries, selectsFrom } from '../../support/queries'

// These tests call the DAL function directly with a request context, in this process, against the test database.
// The page itself is tested in list-page.test.ts.

let listContacts: (ctx: RequestContext, query: ContactQuery) => Promise<ContactPage>
let small: RequestContext
let big: RequestContext
let smallCount: number

beforeAll(async () => {
  ;({ listContacts } = await import('../../../lib/dal/contacts'))
  const org = await smallestOrg()
  small = await contextFor(org.slug)
  smallCount = org.contacts
  big = await contextFor('kestrel')
})

async function walk(ctx: RequestContext, query: ContactQuery = {}) {
  const pages: ContactPage[] = []
  let cursor: string | undefined
  for (let guard = 0; guard < 2000; guard++) {
    const page = await listContacts(ctx, { ...query, cursor })
    pages.push(page)
    if (!page.nextCursor) break
    cursor = page.nextCursor
  }
  return pages
}

describe('A03 the contact list (data access)', () => {
  test('A03.1 the first page has 25 contacts, newest first, with the fields of ContactDTO', async () => {
    const page = await listContacts(big, {})
    const expected = await expectedOrder(big.orgId)
    expect(page.rows).toHaveLength(25)
    expect(page.rows.map((r) => r.id)).toEqual(expected.slice(0, 25).map((r) => r.id))
    expect(page.nextCursor, 'there are more pages').not.toBeNull()
    const row = page.rows[0]
    expect(Object.keys(row).sort()).toEqual(['companyName', 'createdAt', 'email', 'id', 'name', 'ownerId'])
    expect(Number.isNaN(Date.parse(row.createdAt)), 'createdAt is an ISO timestamp').toBe(false)
    const withCompany = page.rows.find((r) => r.companyName)
    expect(withCompany, 'at least one of the first 25 has a company').toBeDefined()
    const [check] = await sql<{ name: string }>('select co.name from contacts c join companies co on co.id = c.company_id where c.id = $1', [withCompany!.id])
    expect(withCompany!.companyName).toBe(check.name)
  })

  test('A03.2 walking every page returns every contact of the organisation exactly once, in order', async () => {
    const pages = await walk(small)
    const ids = pages.flatMap((p) => p.rows.map((r) => r.id))
    const expected = await expectedOrder(small.orgId)
    expect(expected.length).toBe(smallCount)
    expect(ids).toEqual(expected.map((r) => r.id))
    for (const page of pages.slice(0, -1)) expect(page.rows).toHaveLength(25)
    expect(pages[pages.length - 1].nextCursor).toBeNull()
  })

  describe('rows created within the same millisecond', () => {
    // A JavaScript Date has millisecond precision; a Postgres timestamptz has microseconds. Rows that differ only below the millisecond
    // sort correctly in SQL, so a cursor that goes through a Date silently skips or repeats rows at the page boundary.
    const names: string[] = []
    beforeAll(async () => {
      const rows = await sql<{ name: string }>(
        `insert into contacts (org_id, name, email, created_at, updated_at)
         select $1, 'Micro ' || n, 'micro.' || n || '@example.test', timestamptz '2027-01-01 00:00:00+00' + (n * interval '1 microsecond'), now()
           from generate_series(1, 60) n returning name`,
        [small.orgId],
      )
      names.push(...rows.map((r) => r.name))
    })
    afterAll(async () => {
      await sql("delete from contacts where name like 'Micro %' and org_id = $1", [small.orgId])
    })

    test('A03.3 a page boundary inside a group of rows that differ only by microseconds loses and repeats nothing', async () => {
      const ids = (await walk(small)).flatMap((p) => p.rows.map((r) => r.id))
      const expected = (await expectedOrder(small.orgId)).map((r) => r.id)
      expect(expected.length).toBe(smallCount + 60)
      expect(ids.length, 'rows returned').toBe(expected.length)
      expect(new Set(ids).size, 'distinct rows returned').toBe(expected.length)
      expect(ids).toEqual(expected)
    })
  })

  test('A03.4 sort by name walks every contact once, A to Z', async () => {
    const ids = (await walk(small, { sort: 'name' })).flatMap((p) => p.rows.map((r) => r.id))
    expect(ids).toEqual((await expectedOrder(small.orgId, 'name')).map((r) => r.id))
  })

  test('A03.5 search matches name or email, ignoring case, across all pages', async () => {
    const [{ surname }] = await sql<{ surname: string }>(`select split_part(name, ' ', 2) as surname from contacts where org_id = $1 offset 40 limit 1`, [big.orgId])
    const pattern = `%${surname}%`
    const expected = (await expectedOrder(big.orgId, 'created', 'name ilike $2 or email ilike $2', [pattern])).map((r) => r.id)
    expect(expected.length, 'the search term must match something in the seed').toBeGreaterThan(0)
    for (const q of [surname, surname.toUpperCase(), surname.toLowerCase()]) {
      const ids = (await walk(big, { q })).flatMap((p) => p.rows.map((r) => r.id))
      expect(ids, `q=${q}`).toEqual(expected)
    }
    // by email only: an address is found by a piece of itself
    const [{ email }] = await sql<{ email: string }>('select email from contacts where org_id = $1 offset 7 limit 1', [big.orgId])
    const byEmail = await listContacts(big, { q: email.slice(3, 12) })
    expect(byEmail.rows.map((r) => r.email)).toContain(email)
  })

  test('A03.6 the characters % and _ in a search are ordinary characters, not wildcards', async () => {
    for (const q of ['%', '_', '100%', 'a_b']) {
      const rows = (await walk(big, { q })).flatMap((p) => p.rows)
      const literal = await sql<{ n: number }>(`select count(*)::int as n from contacts where org_id = $1 and (strpos(lower(name), $2) > 0 or strpos(lower(email), $2) > 0)`, [big.orgId, q])
      expect(rows.length, `q=${JSON.stringify(q)} must match only rows that contain it literally`).toBe(literal[0].n)
    }
  })

  test('A03.7 every row of every result belongs to the organisation in the request context', async () => {
    const other = await contextFor('acme')
    for (const ctx of [big, other, small]) {
      const first = await listContacts(ctx, {})
      const second = await listContacts(ctx, { cursor: first.nextCursor ?? undefined })
      const ids = [...first.rows, ...second.rows].map((r) => r.id)
      const owners = await sql<{ org_id: string }>('select distinct org_id from contacts where id = any($1)', [ids])
      expect(owners.map((o) => o.org_id), `rows listed for ${ctx.orgSlug}`).toEqual([ctx.orgId])
    }
    // a cursor from another organisation's list must not let you read that organisation
    const kestrelPage = await listContacts(big, {})
    const acmeWithKestrelCursor = await listContacts(other, { cursor: kestrelPage.nextCursor ?? undefined })
    const owners = await sql<{ org_id: string }>('select distinct org_id from contacts where id = any($1)', [acmeWithKestrelCursor.rows.map((r) => r.id)])
    expect(owners.map((o) => o.org_id)).toEqual([other.orgId])
  })

  test('A03.8 a bad cursor, an unknown sort or an empty/huge search never throws: it falls back to the first page', async () => {
    const first = await listContacts(big, {})
    for (const cursor of ['garbage', '', '%00', 'e30', Buffer.from('{"t":"not a date","id":"x"}').toString('base64url'), 'x'.repeat(5000)]) {
      const page = await listContacts(big, { cursor })
      expect(page.rows.map((r) => r.id), `cursor ${cursor.slice(0, 20)}`).toEqual(first.rows.map((r) => r.id))
    }
    const bogusSort = await listContacts(big, { sort: 'bogus' as never })
    expect(bogusSort.rows.map((r) => r.id)).toEqual(first.rows.map((r) => r.id))
    await expect(listContacts(big, { q: 'z'.repeat(20_000) })).resolves.toBeDefined()
    expect((await listContacts(big, { q: '   ' })).rows.map((r) => r.id), 'a blank search is no search').toEqual(first.rows.map((r) => r.id))
  })

  test('A03.9 the queries stay inside the plan budget: no sort and no sequential scan of contacts', async () => {
    const [{ surname }] = await sql<{ surname: string }>(`select split_part(name, ' ', 2) as surname from contacts where org_id = $1 offset 40 limit 1`, [big.orgId])
    const [{ email }] = await sql<{ email: string }>('select email from contacts where org_id = $1 offset 9 limit 1', [big.orgId])
    const firstCursor = (await listContacts(big, {})).nextCursor ?? undefined
    const firstNameCursor = (await listContacts(big, { sort: 'name' })).nextCursor ?? undefined
    const cases: { label: string; query: ContactQuery; allowSort: boolean }[] = [
      { label: 'first page, newest first', query: {}, allowSort: false },
      { label: 'later page, newest first', query: { cursor: firstCursor }, allowSort: false },
      { label: 'first page, by name', query: { sort: 'name' }, allowSort: false },
      { label: 'later page, by name', query: { sort: 'name', cursor: firstNameCursor }, allowSort: false },
      { label: 'search a surname', query: { q: surname }, allowSort: true },
      { label: 'search by part of an email', query: { q: email.slice(3, 12) }, allowSort: true },
    ]
    for (const { label, query, allowSort } of cases) {
      const { queries } = await recordQueries(() => listContacts(big, query))
      const selects = selectsFrom(queries, 'contacts')
      expect(selects.length, `${label}: at least one SELECT from contacts`).toBeGreaterThan(0)
      for (const select of selects) {
        const plan = await planOf(select)
        const where = `${label}: ${describePlan(plan)}`
        expect(plan.some((n) => n.nodeType === 'Seq Scan' && n.relation === 'contacts'), `sequential scan of contacts (${where})`).toBe(false)
        if (!allowSort) expect(plan.some((n) => n.nodeType === 'Sort' || n.nodeType === 'Incremental Sort'), `sort node (${where})`).toBe(false)
      }
    }
  })

  test('A03.10 one page costs at most 2 queries: companies come from a join, not one query per row', async () => {
    const { queries } = await recordQueries(() => listContacts(big, {}))
    const reads = queries.filter((q) => /^\s*(with|select)\b/i.test(q.text))
    expect(reads.length, `queries: ${reads.map((q) => q.text.slice(0, 60)).join(' | ')}`).toBeLessThanOrEqual(2)
  })

  test('A03.11 the list does not read other organisations (ctx.orgId is in the WHERE of every contacts query)', async () => {
    const { queries } = await recordQueries(() => listContacts(small, {}))
    const [other] = await sql<{ id: string }>('select id from orgs where id <> $1 limit 1', [small.orgId])
    for (const select of selectsFrom(queries, 'contacts')) {
      expect(select.values.some((v) => v === small.orgId), `the organisation id is a parameter of: ${select.text.slice(0, 90)}`).toBe(true)
      expect(select.values.includes(other.id)).toBe(false)
    }
  })
})
