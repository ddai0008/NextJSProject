import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { startExtraApp, type ExtraApp } from '../../support/app'
import { bareDigestsOf, credentialValuesOf, parseSetCookie, whereStored } from '../../support/auth'
import { sql } from '../../support/db'
import { cookieHeaderOf, PASSWORD, request } from '../../support/http'

// The contract (see the ticket):
//   POST /api/auth/register {email, name, password}  -> 201 {id}
//   POST /api/auth/login    {email, password}        -> 200 {userId} + Set-Cookie
//   POST /api/auth/logout                            -> 204, cookie cleared, session deleted
//   GET  /api/auth/session                           -> 200 {userId, email} | 401

let counter = 0
const emailAddress = () => `a05-${Date.now().toString(36)}-${counter++}-${Math.random().toString(36).slice(2, 6)}@act.test`
const register = (email: string, password = PASSWORD, name = 'A05 Test', base?: string) => request('/api/auth/register', { json: { email, name, password }, base })
const login = (email: string, password = PASSWORD, extra: { cookie?: string; base?: string } = {}) => request('/api/auth/login', { json: { email, password }, ...extra })
const whoami = (cookie: string | null, base?: string) => request('/api/auth/session', { cookie, base })

async function newUser(password = PASSWORD) {
  const email = emailAddress()
  const response = await register(email, password)
  expect(response.status, `register ${email}: ${await response.clone().text()}`).toBe(201)
  const { id } = (await response.json()) as { id: string }
  return { email, id }
}

describe('A05 registering', () => {
  test('A05.1 register answers 201 with the new id; bad input is a 400; an email already registered (any case) is a 409', async () => {
    const email = emailAddress()
    const ok = await register(email)
    expect(ok.status).toBe(201)
    expect((await ok.json()).id).toMatch(/^[0-9a-f-]{36}$/)
    for (const [label, body] of [
      ['not an email', { email: 'nope', name: 'x', password: PASSWORD }],
      ['no name', { email: emailAddress(), name: '', password: PASSWORD }],
      ['password too short', { email: emailAddress(), name: 'x', password: 'short' }],
      ['password absurdly long (a hashing DoS)', { email: emailAddress(), name: 'x', password: 'x'.repeat(100_000) }],
      ['missing fields', {}],
    ] as const) {
      const response = await request('/api/auth/register', { json: body })
      expect(response.status, label).toBe(400)
    }
    const malformed = await request('/api/auth/register', { method: 'POST', body: '{not json', headers: { 'content-type': 'application/json' } })
    expect(malformed.status, 'malformed JSON').toBe(400)
    expect((await register(email.toUpperCase())).status, 'the same address in capitals').toBe(409)
    const text = await ok.clone().text()
    expect(text).not.toContain(PASSWORD)
  })

  test('A05.2 the password is stored nowhere in the clear, and what is stored is neither a bare digest nor the same for two users', async () => {
    const a = await newUser()
    const b = await newUser()
    expect(await whereStored(PASSWORD), 'columns holding the plaintext password').toEqual([])
    const identityOf = async (id: string) => (await sql<{ email: string; name: string }>('select email, name from users where id = $1', [id]))[0]
    const credA = await credentialValuesOf(a.id, Object.values(await identityOf(a.id)))
    const credB = await credentialValuesOf(b.id, Object.values(await identityOf(b.id)))
    expect(credA.length, 'a stored credential for user A (a string of 20+ characters in a row that mentions A)').toBeGreaterThan(0)
    expect(credB.length).toBeGreaterThan(0)
    expect(credA.filter((value) => credB.includes(value)), 'values stored identically for two users with the same password (unsalted)').toEqual([])
    const digests = bareDigestsOf(PASSWORD)
    for (const value of [...credA, ...credB]) expect(digests, `${value.slice(0, 12)}… looks like a fast digest of the password`).not.toContain(value)
  })
})

describe('A05 signing in', () => {
  test('A05.3 login answers 200 {userId} and sets a cookie; a wrong password and an unknown email are indistinguishable', async () => {
    const user = await newUser()
    const ok = await login(user.email)
    expect(ok.status).toBe(200)
    expect((await ok.json()).userId).toBe(user.id)
    expect(ok.headers.getSetCookie().length, 'a session cookie').toBeGreaterThan(0)

    const wrong = await login(user.email, 'not the password at all')
    const unknown = await login(emailAddress(), PASSWORD)
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await wrong.text(), 'same body for a wrong password and an unknown email').toBe(await unknown.text())
    expect(wrong.headers.getSetCookie(), 'no cookie on failure').toEqual([])
    expect(unknown.headers.getSetCookie()).toEqual([])
    expect((await login(user.email.toUpperCase())).status, 'the email is case-insensitive').toBe(200)
  })

  test('A05.4 the cookie: HttpOnly, Secure, SameSite, Path=/, an expiry, and an unguessable value that differs per login', async () => {
    const user = await newUser()
    const first = parseSetCookie((await login(user.email)).headers.getSetCookie()[0])
    const second = parseSetCookie((await login(user.email)).headers.getSetCookie()[0])
    expect(first.attributes.httponly, 'HttpOnly').toBe(true)
    expect(first.attributes.secure, 'Secure (the app runs as a production build)').toBe(true)
    expect(String(first.attributes.samesite).toLowerCase(), 'SameSite').toMatch(/^(lax|strict)$/)
    expect(first.attributes.path, 'Path').toBe('/')
    expect(first.attributes['max-age'] ?? first.attributes.expires, 'an expiry').toBeDefined()
    expect(first.value.length, 'at least 128 bits of randomness, encoded (22+ characters)').toBeGreaterThanOrEqual(22)
    expect(first.value).not.toBe(second.value)
    expect(first.name).toBe(second.name)
  })

  test('A05.5 only a hash of the session token is stored: the cookie value appears in no column', async () => {
    const user = await newUser()
    const cookie = parseSetCookie((await login(user.email)).headers.getSetCookie()[0])
    expect(await whereStored(cookie.value), 'columns holding the raw token').toEqual([])
    expect((await whoami(`${cookie.name}=${cookie.value}`)).status, 'but the cookie still works').toBe(200)
  })

  test('A05.6 GET /api/auth/session says who you are with a valid cookie, and 401 with none, a wrong or a forged one', async () => {
    const user = await newUser()
    const response = await login(user.email)
    const cookie = cookieHeaderOf(response)
    const name = parseSetCookie(response.headers.getSetCookie()[0]).name
    const me = await whoami(cookie)
    expect(me.status).toBe(200)
    expect(await me.json()).toMatchObject({ userId: user.id, email: user.email })
    expect((await whoami(null)).status).toBe(401)
    expect((await whoami(`${name}=not-a-real-token`)).status).toBe(401)
    expect((await whoami(`${name}=${'A'.repeat(43)}`)).status).toBe(401)
  })
})

describe('A05 signing out and staying signed in', () => {
  test('A05.7 logout answers 204, clears the cookie, and ends the session on the server; other sessions of the same user survive', async () => {
    const user = await newUser()
    const one = await login(user.email)
    const two = await login(user.email)
    const cookieOne = cookieHeaderOf(one)
    const cookieTwo = cookieHeaderOf(two)
    const out = await request('/api/auth/logout', { method: 'POST', cookie: cookieOne })
    expect(out.status).toBe(204)
    const cleared = parseSetCookie(out.headers.getSetCookie()[0])
    expect(cleared.value === '' || Number(cleared.attributes['max-age']) === 0 || cleared.attributes.expires !== undefined, 'the cookie is cleared').toBe(true)
    expect((await whoami(cookieOne)).status, 'the signed-out token is dead on the server, not just forgotten by the browser').toBe(401)
    expect((await whoami(cookieTwo)).status, 'the other session is untouched').toBe(200)
  })

  test('A05.8 a cookie that the client chose before logging in is never adopted (session fixation)', async () => {
    const user = await newUser()
    const name = parseSetCookie((await login(user.email)).headers.getSetCookie()[0]).name
    const attacker = 'attacker-chosen-value-0123456789abcdefghijklmnop'
    const response = await login(user.email, PASSWORD, { cookie: `${name}=${attacker}` })
    expect(response.status).toBe(200)
    expect(parseSetCookie(response.headers.getSetCookie()[0]).value, 'a fresh token, not the one offered').not.toBe(attacker)
    expect((await whoami(`${name}=${attacker}`)).status, 'the offered value never authenticates').toBe(401)
  })

  describe('expiry', () => {
    let short: ExtraApp
    beforeAll(async () => {
      short = await startExtraApp({ SESSION_TTL_SECONDS: '2' })
    })
    afterAll(async () => short?.stop())

    test('A05.9 a session ends when SESSION_TTL_SECONDS has passed (the cookie says so too, and the server refuses it)', async () => {
      const email = emailAddress()
      expect((await register(email, PASSWORD, 'Short Lived', short.url)).status).toBe(201)
      const response = await login(email, PASSWORD, { base: short.url })
      const cookie = parseSetCookie(response.headers.getSetCookie()[0])
      expect(Number(cookie.attributes['max-age']), 'Max-Age follows SESSION_TTL_SECONDS').toBeLessThanOrEqual(2)
      expect((await whoami(cookieHeaderOf(response), short.url)).status, 'valid at once').toBe(200)
      await new Promise((resolve) => setTimeout(resolve, 3200))
      expect((await whoami(cookieHeaderOf(response), short.url)).status, 'refused after the lifetime, even though the client still sends it').toBe(401)
    })
  })
})
