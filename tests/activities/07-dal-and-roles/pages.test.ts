import { beforeAll, describe, expect, test } from 'vitest'
import * as cheerio from 'cheerio'
import { sql } from '../../support/db'
import { request, signIn } from '../../support/http'
import { seeded } from '../../support/people'

// What a signed-in person can reach by URL. Membership decides: an organisation you do not belong to looks like one that does not exist.

const emailsOf = async (orgSlug: string, limit = 10) =>
  (await sql<{ email: string }>(`select c.email from contacts c join orgs o on o.id = c.org_id where o.slug = $1 and c.email is not null order by c.created_at desc limit ${limit}`, [orgSlug])).map((r) => r.email)
const textOf = async (path: string, cookie: string | null) => cheerio.load(await (await request(path, { cookie })).text())('body').text()

let acmeEmails: string[]
let kestrelEmails: string[]
let acmeContactId: string

beforeAll(async () => {
  acmeEmails = await emailsOf('acme')
  kestrelEmails = await emailsOf('kestrel')
  ;[{ id: acmeContactId }] = await sql<{ id: string }>("select c.id from contacts c join orgs o on o.id = c.org_id where o.slug = 'acme' order by c.created_at desc limit 1")
})

describe('A07 pages and membership', () => {
  test('A07.9 a member sees their organisation\'s contacts; a member of another organisation sees the not-found page and none of them', async () => {
    const kestrelRep = await signIn('kestrel', 'rep')
    const acmeRep = await signIn('acme', 'rep')
    const asMember = await textOf('/acme/contacts', acmeRep.cookie)
    expect(acmeEmails.filter((e) => asMember.includes(e)).length, "an Acme member sees Acme's contacts").toBeGreaterThan(0)
    for (const path of ['/acme/contacts', `/acme/contacts/${acmeContactId}/edit`, '/acme']) {
      const text = await textOf(path, kestrelRep.cookie)
      expect(acmeEmails.filter((e) => text.includes(e)), `${path} as a Kestrel member: Acme's emails in the page`).toEqual([])
    }
    const notFound = await textOf('/acme/contacts', kestrelRep.cookie)
    expect(notFound, 'looks like an organisation that does not exist').toMatch(/not found|could not be found|404/i)
    const own = await textOf('/kestrel/contacts', kestrelRep.cookie)
    expect(kestrelEmails.filter((e) => own.includes(e)).length, 'but their own organisation works').toBeGreaterThan(0)
  })

  test('A07.10 the members page (/<org>/members) lists the members to an admin and shows nothing to a manager, a rep, or another organisation\'s admin', async () => {
    const admin = await signIn('acme', 'admin')
    const manager = await signIn('acme', 'manager')
    const rep = await signIn('acme', 'rep')
    const foreignAdmin = await signIn('kestrel', 'admin')
    const members = [seeded.acme.admin, seeded.acme.manager, seeded.acme.rep, seeded.consultant]
    const adminText = await textOf('/acme/members', admin.cookie)
    expect(members.filter((e) => adminText.includes(e)), 'members an Acme admin sees').toEqual(members)
    for (const [who, cookie] of [['a manager', manager.cookie], ['a rep', rep.cookie], ["another organisation's admin", foreignAdmin.cookie]] as const) {
      const text = await textOf('/acme/members', cookie)
      expect(members.filter((e) => text.includes(e)), `${who}: emails in the page`).toEqual([])
    }
    const response = await request('/acme/members')
    expect([301, 302, 303, 307, 308], 'not signed in: the gate').toContain(response.status)
  })
})
