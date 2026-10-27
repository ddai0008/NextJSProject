import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as cheerio from 'cheerio'
import { beforeAll, describe, expect, test } from 'vitest'
import { env } from '../../support/env'
import { request, signIn } from '../../support/http'
import { discoverRoutes, fill, fixtures, sensitiveStrings, type Fixture } from '../../support/routes'

// "The proxy must never be the only check." The same walk runs against a build WITH proxy.ts and one built from a copy of the project WITHOUT it.
// For every page and Route Handler the build contains, a visitor who is not signed in (or who sends a forged session cookie) must not receive a
// single sensitive string, whichever door they use.

let secrets: string[]
let fixture: Fixture[]
let forged: string

beforeAll(async () => {
  secrets = await sensitiveStrings()
  fixture = await fixtures()
  const { cookie } = await signIn('kestrel', 'rep')
  forged = `${cookie!.split('=')[0]}=${'A'.repeat(43)}`
})

describe('A06 the starter code from start-activity', () => {
  test('A06.8 the export endpoint is in the project (run: npm run start-activity -- 6)', () => {
    expect(existsSync(join(env.root(), 'app', 'api', 'export', 'contacts', 'route.ts')), 'app/api/export/contacts/route.ts is missing. Run `npm run start-activity -- 6` first.').toBe(true)
  })

  test('A06.9 a signed-in user can still export (the control: the fix must not just switch the endpoint off)', async () => {
    const { cookie } = await signIn('kestrel', 'rep')
    const response = await request('/api/export/contacts?org=kestrel', { cookie })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/text\/csv/)
    const csv = await response.text()
    expect(csv.split('\n')[0]).toBe('name,email,company')
    expect(csv.split('\n').length, 'rows').toBeGreaterThan(100)
  })
})

describe.each([
  ['with proxy.ts', () => env.baseUrl(), () => env.root()],
  ['without proxy.ts', () => env.baseUrlNoProxy(), () => join(env.root(), '.act', 'noproxy')],
] as const)('A06 nothing leaks to a visitor who is not signed in (%s)', (_label, getBase, getAppRoot) => {
  test('A06.10 the probe works: a signed-in member does receive these strings', async () => {
    const { cookie } = await signIn('kestrel', 'rep', getBase())
    const html = await (await request('/kestrel/contacts', { cookie, base: getBase() })).text()
    const text = cheerio.load(html)('body').text()
    expect(secrets.filter((s) => text.includes(s)).length, 'sensitive strings visible to a signed-in user on the list page').toBeGreaterThan(0)
  })

  test('A06.11 no page and no endpoint hands them out without a session or with a forged one', async () => {
    const base = getBase()
    const routes = discoverRoutes(getAppRoot())
    expect(routes.length, 'routes found in the build').toBeGreaterThan(5)
    const leaks: string[] = []
    for (const route of routes) {
      for (const f of fixture) {
        const path = `${fill(route.pattern, f)}?org=${f.orgSlug}&orgSlug=${f.orgSlug}`
        for (const [who, cookie] of [['no cookie', null], ['forged cookie', forged]] as const) {
          const response = await request(path, { cookie, base })
          const body = await response.text()
          const found = secrets.filter((s) => body.includes(s))
          if (found.length > 0) leaks.push(`${route.kind} ${route.pattern} as ${f.orgSlug} (${who}): HTTP ${response.status}, leaked ${found.length} strings, e.g. ${found[0]}`)
          if (route.kind === 'handler' && response.status >= 200 && response.status < 300 && /\bexport\b/.test(route.pattern)) {
            leaks.push(`handler ${route.pattern} answered ${response.status} to ${who}`)
          }
        }
      }
    }
    expect([...new Set(leaks)], 'responses that contain customer data for someone who is not signed in').toEqual([])
  })
})
