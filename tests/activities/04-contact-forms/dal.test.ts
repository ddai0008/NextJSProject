import { beforeAll, describe, expect, test } from 'vitest'
import type { ContactDTO, ContactInput } from '../../../lib/dal/contacts'
import type { RequestContext } from '../../../lib/dal/types'
import { sql, sqlState } from '../../support/db'
import { contextFor } from '../../support/contacts'
import { recordQueries } from '../../support/queries'

type Dal = {
  countContacts(ctx: RequestContext): Promise<number>
  createContact(ctx: RequestContext, input: ContactInput): Promise<ContactDTO>
  getContact(ctx: RequestContext, id: string): Promise<ContactDTO | null>
  updateContact(ctx: RequestContext, id: string, input: ContactInput): Promise<ContactDTO | null>
}
let dal: Dal
let harbor: RequestContext
let acme: RequestContext
const unique = (label: string) => `${label}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 6)}@example.test`

beforeAll(async () => {
  dal = (await import('../../../lib/dal/contacts')) as unknown as Dal
  harbor = await contextFor('harbor')
  acme = await contextFor('acme')
})

describe('A04 contacts (data access)', () => {
  test('A04.1 createContact adds exactly one contact to the organisation of the context, whatever the input says', async () => {
    const before = await dal.countContacts(harbor)
    const email = unique('ada')
    const created = await dal.createContact(harbor, { name: 'Ada Lovelace', email })
    expect(await dal.countContacts(harbor)).toBe(before + 1)
    const [row] = await sql<{ org_id: string; name: string; email: string }>('select org_id, name, email from contacts where id = $1', [created.id])
    expect(row).toMatchObject({ org_id: harbor.orgId, name: 'Ada Lovelace', email })
    expect(created).toMatchObject({ name: 'Ada Lovelace', email })
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false)
    // an organisation id smuggled into the input is not believed
    const sneaky = await dal.createContact(harbor, { name: 'Sneaky', email: unique('sneaky'), orgId: acme.orgId } as ContactInput)
    const [owner] = await sql<{ org_id: string }>('select org_id from contacts where id = $1', [sneaky.id])
    expect(owner.org_id).toBe(harbor.orgId)
  })

  test('A04.2 getContact and updateContact see only the organisation of the context', async () => {
    const created = await dal.createContact(harbor, { name: 'Grace Hopper', email: unique('grace') })
    expect((await dal.getContact(harbor, created.id))?.name).toBe('Grace Hopper')
    expect(await dal.getContact(acme, created.id), "another organisation cannot read it").toBeNull()
    expect(await dal.updateContact(acme, created.id, { name: 'Hijacked', email: null }), "another organisation cannot change it").toBeNull()
    const [unchanged] = await sql<{ name: string }>('select name from contacts where id = $1', [created.id])
    expect(unchanged.name).toBe('Grace Hopper')

    const [{ updated_at: before }] = await sql<{ updated_at: Date }>('select updated_at from contacts where id = $1', [created.id])
    await new Promise((resolve) => setTimeout(resolve, 20))
    const updated = await dal.updateContact(harbor, created.id, { name: 'Grace B. Hopper', email: created.email })
    expect(updated?.name).toBe('Grace B. Hopper')
    const [after] = await sql<{ name: string; updated_at: Date }>('select name, updated_at from contacts where id = $1', [created.id])
    expect(after.name).toBe('Grace B. Hopper')
    expect(after.updated_at.getTime(), 'updated_at moves forward').toBeGreaterThan(before.getTime())
  })

  test('A04.3 an id that is not a uuid is "not found", not an error', async () => {
    expect(await dal.getContact(harbor, 'not-a-uuid')).toBeNull()
    expect(await dal.updateContact(harbor, "1; drop table contacts", { name: 'x', email: null })).toBeNull()
    expect(await dal.getContact(harbor, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  test('A04.4 countContacts equals count(*) for the organisation and costs one query', async () => {
    const [{ n }] = await sql<{ n: number }>('select count(*)::int as n from contacts where org_id = $1', [harbor.orgId])
    const { result, queries } = await recordQueries(() => dal.countContacts(harbor))
    expect(result).toBe(n)
    expect(queries.filter((q) => /^\s*select/i.test(q.text))).toHaveLength(1)
  })

  test('A04.5 the same email twice in one organisation (any case) is refused by the database; another organisation may use it', async () => {
    const email = unique('twice')
    await dal.createContact(harbor, { name: 'First', email })
    const error = await dal.createContact(harbor, { name: 'Second', email: email.toUpperCase() }).then(() => null, (e: unknown) => e)
    expect(error, 'a duplicate must be refused').not.toBeNull()
    expect(sqlState(error), 'SQLSTATE of the refusal (the DAL lets the unique violation through; the form turns it into a message)').toBe('23505')
    await expect(dal.createContact(acme, { name: 'Third', email })).resolves.toMatchObject({ email })
  })
})
