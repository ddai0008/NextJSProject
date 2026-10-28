import { describe, expect, test, vi } from 'vitest'
import { sql } from '../../support/db'
import { signIn } from '../../support/http'
import { inReplayedSession, recordQueries, selectsFrom } from '../../support/queries'

// The other way into the membership table. A07.16 calls `requireRole` with a real sign-in; here the statements it sends are recorded, and replayed as the application's user,
// to ask what the session in which the code learns "which organisations does this person belong to?" can see and change. That session names the PERSON, not a tenant, because
// the tenant is exactly what is being worked out. (A09.7 covers the session that names a tenant.)

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

describe('A09 the session that finds out which organisations a person belongs to', () => {
  test('A09.8 shows the person their own memberships and nobody else\'s, and lets them change, remove or add none', async () => {
    const { requireRole } = await import('../../../lib/dal/session')
    // A person who is a rep in Kestrel and a manager in Acme: two memberships, in two organisations.
    const person = await signIn('kestrel', 'rep', undefined, [['acme', 'manager']])
    // An organisation this person does NOT belong to: adding them there must be refused for the right reason, not because the row already exists.
    const [lumen] = await sql<{ id: string }>("select id from orgs where slug = 'lumen'")
    jar.cookie = person.cookie!
    const { result, queries } = await recordQueries(() => requireRole('kestrel', 'rep'))
    expect(result, 'requireRole works for this person').toMatchObject({ userId: person.userId, orgSlug: 'kestrel', role: 'rep' })
    const at = queries.findIndex((q) => selectsFrom([q], 'memberships').length > 0)
    expect(at, 'requireRole read memberships').toBeGreaterThanOrEqual(0)

    const probe = (text: string, values: unknown[]) =>
      inReplayedSession(queries, at, async (client) => {
        try {
          const r = await client.query(text, values)
          return { rows: r.rows, count: r.rowCount ?? r.rows.length }
        } catch (error) {
          return { error: String((error as { code?: string }).code ?? (error as Error).message) }
        }
      }) as Promise<{ rows: { n?: number }[]; count: number } | { error: string }>
    const none = (r: Awaited<ReturnType<typeof probe>>) => 'error' in r || r.count === 0
    const before = await sql<{ org_id: string; role: string }>('select org_id, role from memberships where user_id = $1 order by org_id', [person.userId])
    expect(before.length, 'the person has two memberships').toBe(2)

    const own = await probe('select count(*)::int as n from memberships where user_id = $1', [person.userId])
    expect('rows' in own && own.rows[0].n === 2, `the person sees their own two memberships (otherwise the zeros below mean nothing): ${JSON.stringify(own)}`).toBe(true)
    const others = await probe('select count(*)::int as n from memberships where user_id <> $1', [person.userId])
    expect('error' in others || others.rows[0].n === 0, `memberships of OTHER people, seen from the session that only needs to know who this person is: ${JSON.stringify(others)}`).toBe(true)

    const promote = await probe("update memberships set role = 'admin' where user_id = $1", [person.userId])
    expect(none(promote), `the person changing their OWN roles from that session: ${JSON.stringify(promote)}`).toBe(true)
    const leave = await probe('delete from memberships where user_id = $1', [person.userId])
    expect(none(leave), `the person deleting their own memberships from that session: ${JSON.stringify(leave)}`).toBe(true)
    const join = await probe("insert into memberships (org_id, user_id, role) values ($1, $2, 'admin') returning org_id", [lumen.id, person.userId])
    expect('error' in join, `the person adding themselves to an organisation they do not belong to, as an admin: ${JSON.stringify(join)}`).toBe(true)

    const after = await sql<{ org_id: string; role: string }>('select org_id, role from memberships where user_id = $1 order by org_id', [person.userId])
    expect(after, 'their memberships, read as the owner afterwards').toEqual(before)
  })
})
