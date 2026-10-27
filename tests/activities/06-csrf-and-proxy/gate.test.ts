import { beforeAll, describe, expect, test } from 'vitest'
import { fixtures } from '../../support/routes'
import { request, signIn } from '../../support/http'

// The login gate: someone who is not signed in who asks for an organisation's page is sent to /login (by proxy.ts). Public pages stay public.
// This is the user-friendly layer. The next file checks that it is not the only one.

let kestrel: { orgSlug: string; contactId: string }

beforeAll(async () => {
  kestrel = (await fixtures()).find((f) => f.orgSlug === 'kestrel')!
})

describe('A06 the login gate', () => {
  test('A06.5 a visitor who is not signed in is redirected to /login from every organisation page', async () => {
    for (const path of [`/${kestrel.orgSlug}`, `/${kestrel.orgSlug}/contacts`, `/${kestrel.orgSlug}/contacts?q=smith&sort=name`, `/${kestrel.orgSlug}/contacts/${kestrel.contactId}/edit`]) {
      const response = await request(path)
      expect([301, 302, 303, 307, 308], `status for ${path} (an HTTP redirect, not a page that redirects later)`).toContain(response.status)
      expect(new URL(response.headers.get('location') ?? '', 'http://app.test').pathname, `where ${path} sends you`).toBe('/login')
    }
  })

  test('A06.6 the home page, /login and /register stay public; a signed-in visitor gets the organisation page', async () => {
    for (const path of ['/', '/login', '/register']) expect((await request(path)).status, path).toBe(200)
    const { cookie } = await signIn('kestrel', 'rep')
    const page = await request(`/${kestrel.orgSlug}/contacts`, { cookie })
    expect(page.status).toBe(200)
  })

  test('A06.7 static assets and the auth endpoints are not caught by the gate', async () => {
    const favicon = await request('/favicon.ico')
    expect(favicon.status, 'favicon').toBe(200)
    expect((await request('/api/auth/session')).status, 'the session endpoint answers itself (401), it is not redirected').toBe(401)
    expect((await request('/api/health')).status).toBe(200)
  })
})
