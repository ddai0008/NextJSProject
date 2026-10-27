import { beforeAll, describe, expect, test, vi } from 'vitest'
import { signIn } from '../../support/http'

// `requireRole(orgSlug, minimum)` is the seam every page and action asks "who is this, and may they?". Pages are covered through HTTP elsewhere in
// this activity, but two layers (this one and the DAL function behind it) refuse a rep, so HTTP alone cannot tell which of them did. Here the function is
// called directly, as a request would call it: the request's cookies come from a real sign-in, and the framework's `redirect()` / `notFound()` / `cookies()`
// are replaced by stand-ins that make the outcome visible. Nothing here knows how sessions are stored, so the same test must keep passing after A10.

const jar = vi.hoisted(() => ({ cookie: '' }))

vi.mock('next/headers', () => {
  const cookieMap = () => new Map(jar.cookie.split('; ').filter(Boolean).map((pair) => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)] as const))
  return {
    cookies: async () => ({
      get: (name: string) => (cookieMap().has(name) ? { name, value: cookieMap().get(name)! } : undefined),
      getAll: () => [...cookieMap()].map(([name, value]) => ({ name, value })),
      has: (name: string) => cookieMap().has(name),
      toString: () => jar.cookie,
    }),
    headers: async () => new Headers(jar.cookie ? { cookie: jar.cookie } : {}),
  }
})
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))

let requireRole: typeof import('../../../lib/dal/session').requireRole
let ForbiddenError: typeof import('../../../lib/dal/errors').ForbiddenError

beforeAll(async () => {
  ;({ requireRole } = await import('../../../lib/dal/session'))
  ;({ ForbiddenError } = await import('../../../lib/dal/errors'))
})

/** What requireRole did: the context it returned, or what it threw. */
async function asking(orgSlug: string, minimum: 'rep' | 'manager' | 'admin') {
  try {
    return { ctx: await requireRole(orgSlug, minimum) }
  } catch (error) {
    if (error instanceof ForbiddenError) return { threw: 'forbidden' as const }
    return { threw: error instanceof Error ? error.message : String(error) }
  }
}

describe('A07 the requireRole seam', () => {
  test('A07.16 requireRole: no or forged session → /login · not a member (or no such organisation) → not found · role below the minimum → forbidden · otherwise the context', async () => {
    jar.cookie = ''
    expect(await asking('acme', 'rep'), 'no cookie').toEqual({ threw: 'REDIRECT /login' })
    jar.cookie = 'session=forged-forged-forged-forged-forged'
    expect(await asking('acme', 'rep'), 'a cookie the server never issued').toEqual({ threw: 'REDIRECT /login' })

    // A manager in acme, who is not a member of kestrel at all.
    const manager = await signIn('acme', 'manager')
    jar.cookie = manager.cookie!
    const granted = await asking('acme', 'manager')
    expect(granted.ctx, 'a manager asking for manager').toMatchObject({ userId: manager.userId, orgSlug: 'acme', role: 'manager' })
    expect(typeof granted.ctx?.orgId, 'the context carries the organisation id, not only the slug').toBe('string')
    expect((await asking('acme', 'rep')).ctx?.role, 'a manager asking for rep').toBe('manager')
    expect(await asking('acme', 'admin'), 'a manager asking for admin').toEqual({ threw: 'forbidden' })
    expect(await asking('kestrel', 'rep'), 'an organisation they do not belong to').toEqual({ threw: 'NOT_FOUND' })
    expect(await asking('no-such-organisation', 'rep'), 'an organisation that does not exist: the same answer, so nobody learns which exist').toEqual({ threw: 'NOT_FOUND' })

    // A rep.
    const rep = await signIn('acme', 'rep')
    jar.cookie = rep.cookie!
    expect((await asking('acme', 'rep')).ctx?.role).toBe('rep')
    expect(await asking('acme', 'manager'), 'a rep asking for manager').toEqual({ threw: 'forbidden' })
    expect(await asking('acme', 'admin'), 'a rep asking for admin').toEqual({ threw: 'forbidden' })

    // An admin may do everything their organisation offers.
    const admin = await signIn('acme', 'admin')
    jar.cookie = admin.cookie!
    for (const minimum of ['rep', 'manager', 'admin'] as const) expect((await asking('acme', minimum)).ctx?.role, `an admin asking for ${minimum}`).toBe('admin')
  })

  test('A07.17 the role belongs to the membership: the same person is a manager in one organisation and a rep in another', async () => {
    const consultant = await signIn('kestrel', 'rep', undefined, [['acme', 'manager']])
    jar.cookie = consultant.cookie!
    expect((await asking('kestrel', 'rep')).ctx, 'in kestrel').toMatchObject({ orgSlug: 'kestrel', role: 'rep' })
    expect(await asking('kestrel', 'manager'), 'a rep in kestrel may not act as a manager there').toEqual({ threw: 'forbidden' })
    expect((await asking('acme', 'manager')).ctx, 'in acme').toMatchObject({ orgSlug: 'acme', role: 'manager' })
    const inAcme = (await asking('acme', 'rep')).ctx
    const inKestrel = (await asking('kestrel', 'rep')).ctx
    expect(inAcme?.orgId, 'the two contexts name different organisations').not.toBe(inKestrel?.orgId)
  })
})
