import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as cheerio from 'cheerio'
import { beforeAll, describe, expect, test } from 'vitest'
import { env } from '../../support/env'
import { smallestOrg, sql } from '../../support/db'
import { expectedOrder } from '../../support/contacts'
import { request, signIn } from '../../support/http'

// The page, tested over HTTP against the production build the runner started. Rows are `tr[data-contact-id]`; the first cell holds the
// name, the second the email; the link to the next page has the text "Next". Anything else about the markup is yours.

let slug: string
let orgId: string
let cookie: string | null
let surname: string

async function load(path: string) {
  const response = await request(path, { cookie })
  const html = await response.text()
  return { response, html, $: cheerio.load(html) }
}

const rowsOf = ($: cheerio.CheerioAPI) =>
  $('tr[data-contact-id]')
    .toArray()
    .map((tr) => ({ id: $(tr).attr('data-contact-id')!, name: $(tr).find('td').eq(0).text().trim(), email: $(tr).find('td').eq(1).text().trim() }))

const nextHref = ($: cheerio.CheerioAPI) => $('a').filter((_, a) => $(a).text().trim() === 'Next').first().attr('href')

beforeAll(async () => {
  const org = await smallestOrg()
  slug = org.slug
  orgId = org.id
  cookie = (await signIn(slug, 'admin')).cookie
  ;[{ surname }] = await sql<{ surname: string }>(`select split_part(name, ' ', 2) as surname from contacts where org_id = $1 offset 11 limit 1`, [orgId])
})

describe('A03 the contact list (page)', () => {
  test('A03.12 /<org>/contacts shows the heading, the column headers, 25 rows and a Next link', async () => {
    const { response, $ } = await load(`/${slug}/contacts`)
    expect(response.status).toBe(200)
    expect($('h1').first().text()).toMatch(/Contacts/)
    const headers = $('th').toArray().map((th) => $(th).text().trim())
    expect(headers, 'column headers').toEqual(expect.arrayContaining(['Name', 'Email']))
    const rows = rowsOf($)
    const expected = await expectedOrder(orgId)
    expect(rows.map((r) => r.id)).toEqual(expected.slice(0, 25).map((r) => r.id))
    expect(rows[0].name).toBe(expected[0].name)
    expect(rows[0].email).toBe(expected[0].email)
    expect(nextHref($), 'a "Next" link').toBeTruthy()
    expect($('input[name="q"]').length, 'a search box named q').toBeGreaterThan(0)
  })

  test('A03.13 following "Next" links from the first page visits every contact once, in order', async () => {
    const seen: string[] = []
    let path: string | undefined = `/${slug}/contacts`
    for (let guard = 0; path && guard < 200; guard++) {
      const { response, $ } = await load(path)
      expect(response.status, path).toBe(200)
      seen.push(...rowsOf($).map((r) => r.email))
      const href = nextHref($)
      path = href ? new URL(href, 'http://app.test').pathname + new URL(href, 'http://app.test').search : undefined
    }
    const expected = (await expectedOrder(orgId)).map((r) => r.email ?? '')
    expect(seen).toEqual(expected)
  })

  test('A03.14 the URL is the state: q and sort filter and order the list, the search box shows q, and Next keeps both', async () => {
    const { $, response } = await load(`/${slug}/contacts?q=${encodeURIComponent(surname)}&sort=name`)
    expect(response.status).toBe(200)
    const rows = rowsOf($)
    const expected = await expectedOrder(orgId, 'name', 'name ilike $2 or email ilike $2', [`%${surname}%`])
    expect(expected.length).toBeGreaterThan(0)
    expect(rows.map((r) => r.id)).toEqual(expected.slice(0, 25).map((r) => r.id))
    expect($('input[name="q"]').first().attr('value'), 'the search box keeps what was searched').toBe(surname)
    // a broad search so there is a second page: part of every seeded address
    const broad = await load(`/${slug}/contacts?q=example&sort=name`)
    const href = nextHref(broad.$)
    expect(href, 'Next link on a broad search').toBeTruthy()
    const url = new URL(href!, 'http://app.test')
    expect(url.searchParams.get('q')).toBe('example')
    expect(url.searchParams.get('sort')).toBe('name')
    expect(url.searchParams.get('cursor')).toBeTruthy()
  })

  test('A03.15 bad parameters give the normal first page, not an error', async () => {
    const normal = rowsOf((await load(`/${slug}/contacts`)).$).map((r) => r.id)
    for (const query of ['sort=bogus', 'cursor=garbage', 'cursor=%00%00', 'q=', 'q=%20%20', `q=${'z'.repeat(5000)}&sort=nope`]) {
      const { response, $ } = await load(`/${slug}/contacts?${query}`)
      expect(response.status, query.slice(0, 40)).toBe(200)
      if (!query.startsWith('q=zzz')) expect(rowsOf($).map((r) => r.id), query.slice(0, 40)).toEqual(normal)
    }
  })

  test('A03.16 an unknown organisation shows the not-found page, marked noindex, with no contacts', async () => {
    const { response, $, html } = await load('/no-such-org/contacts')
    // The data needs params and the database, so it streams: the status is already 200 when notFound() runs (see the ticket), and
    // Next marks the page noindex instead. A real 404 status is also accepted.
    expect([200, 404]).toContain(response.status)
    expect($('meta[name="robots"]').attr('content') ?? '', 'robots meta').toMatch(/noindex/)
    expect(rowsOf($)).toHaveLength(0)
    expect(html).toMatch(/not found|could not be found|404/i)
  })

  test('A03.17 the prerendered shell already holds the heading and the table headers, and none of the contacts', async () => {
    const shell = readFileSync(join(env.root(), '.next', 'server', 'app', '[orgSlug]', 'contacts.html'), 'utf8')
    const $ = cheerio.load(shell)
    expect($('h1').first().text(), 'the <h1> is part of the shell').toMatch(/Contacts/)
    const headers = $('th').toArray().map((th) => $(th).text().trim())
    expect(headers, 'the table header row is part of the shell').toEqual(expect.arrayContaining(['Name', 'Email']))
    expect($('tr[data-contact-id]').length, 'no contact rows in the shell').toBe(0)
    const { rows } = { rows: await sql<{ name: string }>('select name from contacts where org_id = $1 order by created_at desc limit 5', [orgId]) }
    for (const row of rows) expect(shell.includes(row.name), `shell must not contain ${row.name}`).toBe(false)
  })
})
