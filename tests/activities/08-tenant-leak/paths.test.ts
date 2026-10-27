import * as cheerio from 'cheerio'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from '../../support/db'
import { request, signIn, type Signed } from '../../support/http'

// "Kestrel Solar can see Acme's contacts": the same mistake on three paths a customer can reach. A person belongs to the organisation in the URL; the
// contact named in the URL is then fetched by its id alone. Each test also checks that the legitimate use still works, because the cheapest "fix" is to switch the thing off.

const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const acme = { name: `Acme Secret Contact ${token}`, email: `secret.${token}@acme-private.test`, id: '' }
const own = { name: `Kestrel Own Contact ${token}`, email: `own.${token}@kestrel-private.test`, id: '' }
const colleagues = { name: `Kestrel Colleague Contact ${token}`, email: `colleague.${token}@kestrel-private.test`, id: '' }
let rep: Signed // a rep of Kestrel, and nothing else
let manager: Signed // a manager of Kestrel
let both: Signed // a rep of Kestrel AND a manager of Acme
let otherRepId: string
const created: string[] = []

beforeAll(async () => {
  rep = await signIn('kestrel', 'rep')
  manager = await signIn('kestrel', 'manager')
  both = await signIn('kestrel', 'rep', undefined, [['acme', 'manager']])
  const [other] = await sql<{ id: string }>("insert into users (email, name) values ($1, 'Kestrel Other Rep') returning id", [`other-rep.${token}@act.test`])
  otherRepId = other.id
  await sql("insert into memberships (org_id, user_id, role) select id, $1, 'rep' from orgs where slug = 'kestrel'", [other.id])
  const add = async (slug: string, ownerId: string | null, c: { name: string; email: string }) => {
    const [row] = await sql<{ id: string }>('insert into contacts (org_id, owner_id, name, email) select id, $2, $3, $4 from orgs where slug = $1 returning id', [slug, ownerId, c.name, c.email])
    created.push(row.id)
    return row.id
  }
  acme.id = await add('acme', null, acme)
  own.id = await add('kestrel', rep.userId, own)
  colleagues.id = await add('kestrel', other.id, colleagues)
})
afterAll(async () => {
  await sql('delete from contacts where id = any($1)', [created])
  await sql('delete from memberships where user_id = $1', [otherRepId])
  await sql('delete from users where id = $1', [otherRepId])
})

const html = async (path: string, cookie: string | null) => (await request(path, { cookie })).text()
const bodyText = (page: string) => cheerio.load(page)('body').text()
const nameOf = async (id: string) => (await sql<{ name: string }>('select name from contacts where id = $1', [id]))[0]?.name
const emailOf = async (id: string) => (await sql<{ email: string }>('select email from contacts where id = $1', [id]))[0]?.email
const NOT_FOUND = /not found|could not be found|404/i

describe('A08 the contact page', () => {
  test('A08.1 a Kestrel member who puts an Acme contact id in their own organisation\'s URL gets the not-found page and none of the data; their own contacts still open', async () => {
    const stolen = await html(`/kestrel/contacts/${acme.id}`, rep.cookie)
    expect([acme.name, acme.email].filter((s) => stolen.includes(s)), "Acme's contact in the page").toEqual([])
    expect(bodyText(stolen), 'looks like a contact that does not exist').toMatch(NOT_FOUND)
    const mine = await html(`/kestrel/contacts/${own.id}`, rep.cookie)
    expect([own.name, own.email].filter((s) => !mine.includes(s)), "their own contact's details are on the page").toEqual([])
    expect(bodyText(await html('/kestrel/contacts/not-a-uuid', rep.cookie)), 'a malformed id is simply not found').toMatch(NOT_FOUND)
  })

  test('A08.2 the organisation in the URL decides: a person who belongs to BOTH organisations sees Acme\'s contact under /acme and not under /kestrel', async () => {
    const wrongTenant = await html(`/kestrel/contacts/${acme.id}`, both.cookie)
    expect([acme.name, acme.email].filter((s) => wrongTenant.includes(s)), 'Acme\'s contact under the Kestrel URL').toEqual([])
    expect(bodyText(wrongTenant)).toMatch(NOT_FOUND)
    const rightTenant = await html(`/acme/contacts/${acme.id}`, both.cookie)
    expect([acme.name, acme.email].filter((s) => !rightTenant.includes(s)), 'the same contact under the Acme URL, where they are a manager').toEqual([])

    const apiWrong = await request(`/api/orgs/kestrel/contacts/${acme.id}`, { cookie: both.cookie })
    expect(apiWrong.status, 'the mobile endpoint, wrong tenant').toBe(404)
    expect(await apiWrong.text()).not.toContain(acme.email)
    const apiRight = await request(`/api/orgs/acme/contacts/${acme.id}`, { cookie: both.cookie })
    expect(apiRight.status, 'the mobile endpoint, right tenant').toBe(200)
    expect(((await apiRight.json()) as { email: string }).email).toBe(acme.email)
  })
})

describe('A08 the mobile endpoint', () => {
  test('A08.3 GET /api/orgs/<slug>/contacts/<id>: another organisation\'s contact is 404 with no data; your own is 200 with name and email; strangers get nothing', async () => {
    const stolen = await request(`/api/orgs/kestrel/contacts/${acme.id}`, { cookie: rep.cookie })
    expect(stolen.status, "an Acme contact asked for with a Kestrel member's cookie").toBe(404)
    const stolenBody = await stolen.text()
    expect([acme.name, acme.email].filter((s) => stolenBody.includes(s)), 'Acme data in the body').toEqual([])

    const mine = await request(`/api/orgs/kestrel/contacts/${own.id}`, { cookie: rep.cookie })
    expect(mine.status, 'their own contact').toBe(200)
    expect(await mine.json(), 'the mobile app reads name and email').toMatchObject({ name: own.name, email: own.email })

    expect((await request(`/api/orgs/kestrel/contacts/not-a-uuid`, { cookie: rep.cookie })).status, 'a malformed id').toBe(404)
    for (const [who, cookie] of [['nobody', null], ['a forged cookie', 'session=forged-forged-forged-forged-forged']] as const) {
      const response = await request(`/api/orgs/acme/contacts/${acme.id}`, { cookie })
      const body = await response.text()
      expect(response.status === 200 || body.includes(acme.email), `${who} gets the contact`).toBe(false)
    }
  })
})

// The rename form posts the organisation and the contact as hidden fields. Anything in a form can be edited by whoever holds it, so the test edits it:
// it takes the form from the page of a contact the person may open and swaps in other ids, exactly as a browser's developer tools would.
type Field = [name: string, value: string]
async function renameForm(cookie: string | null, path: string): Promise<Field[]> {
  const $ = cheerio.load(await html(path, cookie))
  const form = $('form[aria-label="Rename contact"]')
  expect(form.length, `the rename form (aria-label "Rename contact") is on ${path}`).toBe(1)
  const fields: Field[] = []
  form.find('input, textarea').each((_, element) => {
    const name = $(element).attr('name')
    if (name) fields.push([name, $(element).attr('value') ?? $(element).text()])
  })
  return fields
}
async function submit(cookie: string | null, path: string, fields: Field[], edit: (name: string, value: string) => string) {
  const body = new FormData()
  for (const [name, value] of fields) body.append(name, edit(name, value))
  return request(path, { method: 'POST', body, cookie })
}
const swapId = (from: string, to: string, newName: string) => (name: string, value: string) => (name === 'name' ? newName : value === from ? to : value)

describe('A08 the rename form', () => {
  test('A08.4 a form edited to name an Acme contact renames nothing; the honest form renames the person\'s own contact and keeps its email', async () => {
    const path = `/kestrel/contacts/${own.id}`
    const fields = await renameForm(rep.cookie, path)

    await submit(rep.cookie, path, fields, swapId(own.id, acme.id, `Hijacked ${token}`))
    expect(await nameOf(acme.id), "Acme's contact after the forged form").toBe(acme.name)

    const honest = await submit(rep.cookie, path, fields, (name, value) => (name === 'name' ? `Renamed by its owner ${token}` : value))
    expect(honest.status, 'the honest form is accepted (a redirect back to the page)').toBeLessThan(400)
    expect(await nameOf(own.id), 'their own contact').toBe(`Renamed by its owner ${token}`)
    expect(await emailOf(own.id), 'a rename must not wipe the email').toBe(own.email)
  })

  test('A08.5 inside one organisation the same rules as A07 apply to the form: a rep cannot rename a colleague\'s contact, a manager can', async () => {
    const path = `/kestrel/contacts/${own.id}`
    const asRep = await renameForm(rep.cookie, path)
    await submit(rep.cookie, path, asRep, swapId(own.id, colleagues.id, `Taken over ${token}`))
    expect(await nameOf(colleagues.id), "a colleague's contact after a rep's forged form").toBe(colleagues.name)

    const managerPath = `/kestrel/contacts/${colleagues.id}`
    const asManager = await renameForm(manager.cookie, managerPath)
    await submit(manager.cookie, managerPath, asManager, (name, value) => (name === 'name' ? `Renamed by a manager ${token}` : value))
    expect(await nameOf(colleagues.id), 'a manager may rename it').toBe(`Renamed by a manager ${token}`)
    expect(await emailOf(colleagues.id)).toBe(colleagues.email)
  })
})
