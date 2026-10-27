import { describe, expect, test } from 'vitest'
import { sql } from '../../support/db'
import { env } from '../../support/env'
import { PASSWORD, request, signIn } from '../../support/http'

// A browser attaches your cookies to a request no matter which site caused it. Server Actions are protected by Next.js (it compares the Origin header with the Host);
// Route Handlers are not: each one has to refuse a request that came from somewhere else. These tests run against BOTH builds: with proxy.ts and without it.

const instances = [
  ['with proxy.ts', () => env.baseUrl()],
  ['without proxy.ts', () => env.baseUrlNoProxy()],
] as const

describe.each(instances)('A06 CSRF (%s)', (_label, getBase) => {
  const EVIL = 'https://evil.example'

  test('A06.1 a cross-site POST to logout is refused with 403 and the session survives', async () => {
    const base = getBase()
    const { cookie } = await signIn('kestrel', 'rep', base)
    expect(cookie, 'a signed-in cookie').toBeTruthy()
    const refused = await request('/api/auth/logout', { method: 'POST', cookie, headers: { origin: EVIL }, base })
    expect(refused.status).toBe(403)
    expect((await request('/api/auth/session', { cookie, base })).status, 'still signed in: the forged logout did nothing').toBe(200)
  })

  test('A06.2 a cross-site POST to login or register is refused and has no effect', async () => {
    const base = getBase()
    const email = `a06-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@act.test`
    const register = await request('/api/auth/register', { json: { email, name: 'Evil', password: PASSWORD }, headers: { origin: EVIL }, base })
    expect(register.status, 'register from another site').toBe(403)
    expect(await sql('select 1 from users where lower(email) = $1', [email]), 'no user was created').toHaveLength(0)

    const { email: realEmail } = await signIn('kestrel', 'rep', base)
    const login = await request('/api/auth/login', { json: { email: realEmail, password: PASSWORD }, headers: { origin: EVIL }, base })
    expect(login.status, 'login from another site (login CSRF: it would sign the victim in as the attacker)').toBe(403)
    expect(login.headers.getSetCookie(), 'no session cookie').toEqual([])
  })

  test('A06.3 the same site is let through, and so is a request with no browser headers at all', async () => {
    const base = getBase()
    const { cookie } = await signIn('kestrel', 'rep', base)
    const ok = await request('/api/auth/logout', { method: 'POST', cookie, headers: { origin: base }, base })
    expect(ok.status, 'same-origin logout').toBe(204)
    const { cookie: other } = await signIn('kestrel', 'rep', base)
    const noHeaders = await request('/api/auth/logout', { method: 'POST', cookie: other, omitOrigin: true, base })
    expect(noHeaders.status, 'a server-to-server or curl request has no Origin and no Sec-Fetch-Site; CSRF needs a browser').toBe(204)
  })

  test('A06.4 Origin: null (a sandboxed frame, some redirects) and Sec-Fetch-Site: cross-site are refused', async () => {
    const base = getBase()
    const { cookie } = await signIn('kestrel', 'rep', base)
    expect((await request('/api/auth/logout', { method: 'POST', cookie, headers: { origin: 'null' }, base })).status, 'Origin: null').toBe(403)
    expect((await request('/api/auth/logout', { method: 'POST', cookie, omitOrigin: true, headers: { 'sec-fetch-site': 'cross-site' }, base })).status, 'cross-site without an Origin').toBe(403)
    expect((await request('/api/auth/logout', { method: 'POST', cookie, omitOrigin: true, headers: { 'sec-fetch-site': 'same-site' }, base })).status, 'same-site is a different origin (a sibling subdomain)').toBe(403)
    expect((await request('/api/auth/session', { cookie, base })).status).toBe(200)
  })
})
