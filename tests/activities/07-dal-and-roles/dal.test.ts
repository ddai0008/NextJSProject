import { beforeAll, describe, expect, test } from 'vitest'
import type { RequestContext } from '../../../lib/dal/types'
import { sql, sqlState } from '../../support/db'
import { ctxOf, seeded } from '../../support/people'

// The permission matrix, called directly: every DAL function takes a RequestContext and decides what that person may do.
//   contacts : read - any member · create - any member (and they own it) · change - the owner, or a manager/admin · delete, reassign - manager/admin
//   deals    : a rep sees and changes only their own; managers and admins see and change every deal of the organisation
//   members  : admins only (list, change role); the last admin cannot be demoted
//   another organisation's rows are "not found" (null / false), never "forbidden": a caller learns nothing about other tenants

type Dal = typeof import('../../../lib/dal/contacts') & typeof import('../../../lib/dal/contact-admin') & typeof import('../../../lib/dal/deals') & typeof import('../../../lib/dal/members')
let dal: Dal
let ForbiddenError: typeof import('../../../lib/dal/errors').ForbiddenError

let acmeRep: RequestContext, acmeOtherRep: RequestContext, acmeManager: RequestContext, acmeAdmin: RequestContext
let kestrelRep: RequestContext, kestrelManager: RequestContext, kestrelAdmin: RequestContext
let consultantInKestrel: RequestContext, consultantInAcme: RequestContext

beforeAll(async () => {
  dal = {
    ...(await import('../../../lib/dal/contacts')),
    ...(await import('../../../lib/dal/contact-admin')),
    ...(await import('../../../lib/dal/deals')),
    ...(await import('../../../lib/dal/members')),
  } as Dal
  ;({ ForbiddenError } = await import('../../../lib/dal/errors'))
  acmeRep = await ctxOf(seeded.acme.rep, 'acme')
  acmeOtherRep = await ctxOf(seeded.acme.otherRep, 'acme')
  acmeManager = await ctxOf(seeded.acme.manager, 'acme')
  acmeAdmin = await ctxOf(seeded.acme.admin, 'acme')
  kestrelRep = await ctxOf(seeded.kestrel.rep, 'kestrel')
  kestrelManager = await ctxOf(seeded.kestrel.manager, 'kestrel')
  kestrelAdmin = await ctxOf(seeded.kestrel.admin, 'kestrel')
  consultantInKestrel = await ctxOf(seeded.consultant, 'kestrel')
  consultantInAcme = await ctxOf(seeded.consultant, 'acme')
})

let n = 0
const unique = (label: string) => `${label}.${Date.now().toString(36)}.${n++}@example.test`
async function newContact(orgId: string, ownerId: string | null, name = 'Matrix Contact') {
  const email = unique('matrix')
  const [row] = await sql<{ id: string }>('insert into contacts (org_id, owner_id, name, email) values ($1, $2, $3, $4) returning id', [orgId, ownerId, name, email])
  return { id: row.id, email }
}
const nameOf = async (id: string) => (await sql<{ name: string }>('select name from contacts where id = $1', [id]))[0]?.name

/** 'ok' | 'forbidden' | 'not found', whatever the function returned or threw. */
async function outcome(run: () => Promise<unknown>): Promise<'ok' | 'forbidden' | 'not found' | string> {
  try {
    const result = await run()
    return result === null || result === false ? 'not found' : 'ok'
  } catch (error) {
    if (error instanceof ForbiddenError) return 'forbidden'
    return `threw ${(error as Error).name}: ${String((error as Error).message).slice(0, 120)}`
  }
}

describe('A07 contacts', () => {
  test('A07.1 changing a contact: the owner, a manager and an admin may; another rep may not; another organisation cannot even see it', async () => {
    const cases: [string, () => RequestContext, string][] = [
      ['the owner (a rep)', () => acmeRep, 'ok'],
      ['another rep of the same organisation', () => acmeOtherRep, 'forbidden'],
      ['a manager', () => acmeManager, 'ok'],
      ['an admin', () => acmeAdmin, 'ok'],
      ['a rep of another organisation', () => kestrelRep, 'not found'],
      ['a manager of another organisation', () => kestrelManager, 'not found'],
      ['the consultant acting as the REP she is in Kestrel', () => consultantInKestrel, 'not found'],
      ['the consultant acting as the MANAGER she is in Acme', () => consultantInAcme, 'ok'],
    ]
    for (const [who, ctx, expected] of cases) {
      const contact = await newContact(acmeRep.orgId, acmeRep.userId)
      const result = await outcome(() => dal.updateContact(ctx(), contact.id, { name: `Changed by ${who}`, email: contact.email }))
      expect(result, who).toBe(expected)
      expect(await nameOf(contact.id), `${who}: the name in the database`).toBe(expected === 'ok' ? `Changed by ${who}` : 'Matrix Contact')
    }
    const unowned = await newContact(acmeRep.orgId, null)
    expect(await outcome(() => dal.updateContact(acmeRep, unowned.id, { name: 'x', email: unowned.email })), 'a rep and a contact nobody owns').toBe('forbidden')
    expect(await outcome(() => dal.updateContact(acmeManager, unowned.id, { name: 'x', email: unowned.email })), 'a manager and a contact nobody owns').toBe('ok')
  })

  test('A07.2 deleting a contact: managers and admins only; another organisation cannot', async () => {
    const victim = async () => newContact(acmeRep.orgId, acmeRep.userId)
    const a = await victim()
    expect(await outcome(() => dal.deleteContact(acmeRep, a.id)), 'even the owner, as a rep').toBe('forbidden')
    expect(await nameOf(a.id)).toBeDefined()
    expect(await outcome(() => dal.deleteContact(kestrelManager, a.id)), "another organisation's manager").toBe('not found')
    expect(await nameOf(a.id), 'still there').toBeDefined()
    expect(await outcome(() => dal.deleteContact(acmeManager, a.id)), 'a manager').toBe('ok')
    expect(await nameOf(a.id), 'gone').toBeUndefined()
    expect(await dal.deleteContact(acmeManager, a.id), 'deleting it again').toBe(false)
    expect(await dal.deleteContact(acmeManager, 'not-a-uuid'), 'a malformed id').toBe(false)
  })

  test('A07.3 a contact you create is owned by you', async () => {
    const created = await dal.createContact(acmeRep, { name: 'Owned By Creator', email: unique('owned') })
    expect(created.ownerId).toBe(acmeRep.userId)
    const [row] = await sql<{ owner_id: string }>('select owner_id from contacts where id = $1', [created.id])
    expect(row.owner_id).toBe(acmeRep.userId)
  })

  test('A07.4 reassigning: managers and admins only, and only to a member of the organisation (the database refuses anyone else)', async () => {
    const contact = await newContact(acmeRep.orgId, acmeRep.userId)
    expect(await outcome(() => dal.reassignContact(acmeRep, contact.id, acmeOtherRep.userId)), 'a rep').toBe('forbidden')
    const moved = await dal.reassignContact(acmeManager, contact.id, acmeOtherRep.userId)
    expect(moved?.ownerId).toBe(acmeOtherRep.userId)
    expect(await outcome(() => dal.reassignContact(kestrelManager, contact.id, kestrelRep.userId)), "another organisation's manager").toBe('not found')
    const error = await dal.reassignContact(acmeManager, contact.id, kestrelRep.userId).then(() => null, (e: unknown) => e)
    expect(error, 'a person who is not a member of this organisation').not.toBeNull()
    expect(sqlState(error), 'the refusal is the database\'s (foreign key)').toBe('23503')
  })
})

describe('A07 deals', () => {
  test('A07.5 a rep sees only their own deals; managers and admins see the organisation\'s; nobody sees another organisation\'s', async () => {
    const ids = async (ctx: RequestContext) => (await dal.listDeals(ctx)).map((d) => d.id)
    const sqlIds = async (where: string, params: unknown[]) => (await sql<{ id: string }>(`select id from deals where ${where} order by created_at desc, id desc`, params)).map((r) => r.id)

    expect(await ids(acmeRep), 'a rep').toEqual(await sqlIds('org_id = $1 and owner_id = $2', [acmeRep.orgId, acmeRep.userId]))
    expect(await ids(acmeManager), 'a manager').toEqual(await sqlIds('org_id = $1', [acmeRep.orgId]))
    expect(await ids(acmeAdmin), 'an admin').toEqual(await sqlIds('org_id = $1', [acmeRep.orgId]))
    expect(await ids(kestrelRep), 'a rep of another organisation').toEqual(await sqlIds('org_id = $1 and owner_id = $2', [kestrelRep.orgId, kestrelRep.userId]))
    expect((await ids(acmeRep)).length, 'the rep sees fewer than the manager').toBeLessThan((await ids(acmeManager)).length)
    // roles belong to memberships: the same person is a rep in Kestrel and a manager in Acme
    expect(await ids(consultantInKestrel), 'the consultant as a rep in Kestrel').toEqual(await sqlIds('org_id = $1 and owner_id = $2', [consultantInKestrel.orgId, consultantInKestrel.userId]))
    expect(await ids(consultantInAcme), 'the consultant as a manager in Acme').toEqual(await sqlIds('org_id = $1', [acmeRep.orgId]))
    const foreign = await sql<{ id: string }>('select id from deals where id = any($1) and org_id <> $2', [await ids(acmeManager), acmeRep.orgId])
    expect(foreign).toHaveLength(0)
  })

  test('A07.6 changing a deal: a rep only their own; managers and admins any in the organisation; not another organisation\'s; never a negative value', async () => {
    const [own] = await sql<{ id: string }>('select id from deals where org_id = $1 and owner_id = $2 limit 1', [acmeRep.orgId, acmeRep.userId])
    const [others] = await sql<{ id: string }>('select id from deals where org_id = $1 and owner_id <> $2 limit 1', [acmeRep.orgId, acmeRep.userId])
    const retitle = (ctx: RequestContext, id: string, title: string) => outcome(() => dal.updateDeal(ctx, id, { title }))
    expect(await retitle(acmeRep, own.id, 'Mine, renamed'), 'a rep and their own deal').toBe('ok')
    expect(await retitle(acmeRep, others.id, 'Not mine'), "a rep and someone else's deal").toBe('forbidden')
    expect((await sql<{ title: string }>('select title from deals where id = $1', [others.id]))[0].title).not.toBe('Not mine')
    expect(await retitle(acmeManager, others.id, 'Renamed by a manager'), 'a manager').toBe('ok')
    expect(await retitle(kestrelManager, others.id, 'From another organisation'), "another organisation's manager").toBe('not found')
    const error = await dal.updateDeal(acmeManager, own.id, { valueCents: -5 }).then(() => null, (e: unknown) => e)
    expect(sqlState(error), 'a negative value is refused by the database').toBe('23514')
  })
})

describe('A07 members', () => {
  test('A07.7 only admins list the members, only of their own organisation, and only what an admin needs to see', async () => {
    const members = await dal.listMembers(acmeAdmin)
    const expected = await sql<{ email: string; role: string }>('select u.email, m.role from memberships m join users u on u.id = m.user_id where m.org_id = $1 order by u.email', [acmeAdmin.orgId])
    expect(members.map((m) => `${m.email}:${m.role}`).sort()).toEqual(expected.map((e) => `${e.email}:${e.role}`).sort())
    expect(members.map((m) => m.email)).toContain(seeded.consultant)
    expect(Object.keys(members[0]).sort(), 'a MemberDTO has these fields and no others').toEqual(['email', 'name', 'role', 'userId'])
    expect(JSON.stringify(members), 'no password hash').not.toMatch(/scrypt\$|argon2|password/i)
    expect((await dal.listMembers(kestrelAdmin)).map((m) => m.email), "another organisation's admin sees that organisation's members").not.toContain(seeded.acme.rep)
    for (const [who, ctx] of [['a manager', acmeManager], ['a rep', acmeRep], ['the consultant, a manager in Acme', consultantInAcme]] as const) {
      expect(await outcome(() => dal.listMembers(ctx)), who).toBe('forbidden')
    }
  })

  test('A07.8 changing a role: admins only; not for someone outside the organisation; the last admin stays', async () => {
    const [newcomer] = await sql<{ id: string }>("insert into users (email, name) values ($1, 'Role Test') returning id", [unique('role')])
    await sql("insert into memberships (org_id, user_id, role) values ($1, $2, 'rep')", [acmeAdmin.orgId, newcomer.id])
    const promoted = await dal.changeRole(acmeAdmin, newcomer.id, 'manager')
    expect(promoted?.role).toBe('manager')
    expect((await sql<{ role: string }>('select role from memberships where org_id = $1 and user_id = $2', [acmeAdmin.orgId, newcomer.id]))[0].role).toBe('manager')
    expect(await outcome(() => dal.changeRole(acmeManager, newcomer.id, 'admin')), 'a manager').toBe('forbidden')
    expect(await outcome(() => dal.changeRole(kestrelAdmin, newcomer.id, 'rep')), "another organisation's admin").toBe('not found')
    // The last-admin rule, in an organisation of its own (other tests add admins to the seeded ones, and files run in any order).
    const slug = `last-admin-${Date.now().toString(36)}`
    const [org] = await sql<{ id: string }>("insert into orgs (slug, name) values ($1, 'Last Admin Test') returning id", [slug])
    const [soleAdmin] = await sql<{ id: string }>("insert into users (email, name) values ($1, 'Sole Admin') returning id", [unique('sole')])
    await sql("insert into memberships (org_id, user_id, role) values ($1, $2, 'admin')", [org.id, soleAdmin.id])
    await sql("insert into memberships (org_id, user_id, role) values ($1, $2, 'rep')", [org.id, newcomer.id])
    try {
      const soleAdminCtx: RequestContext = { userId: soleAdmin.id, orgId: org.id, orgSlug: slug, role: 'admin' }
      expect(await outcome(() => dal.changeRole(soleAdminCtx, soleAdmin.id, 'manager')), 'demoting the last admin').toBe('forbidden')
      expect((await sql<{ role: string }>('select role from memberships where org_id = $1 and user_id = $2', [org.id, soleAdmin.id]))[0].role).toBe('admin')
      expect(await outcome(() => dal.changeRole(soleAdminCtx, newcomer.id, 'admin')), 'promoting someone else to admin first').toBe('ok')
      expect(await outcome(() => dal.changeRole(soleAdminCtx, soleAdmin.id, 'manager')), 'now there is another admin, so stepping down is allowed').toBe('ok')
    } finally {
      await sql('delete from memberships where org_id = $1', [org.id])
      await sql('delete from orgs where id = $1', [org.id])
    }
  })
})
