import { beforeAll, describe, expect, test } from 'vitest'
import { inRolledBackTransaction, orgs, sql, stateOf } from '../../support/db'

// The database itself must refuse bad data. Every "refused" test has a positive control: the same statement with valid values works,
// so a typo in the test cannot pass for a constraint.

type Ids = {
  kestrel: string
  acme: string
  kestrelCompany: string
  acmeCompany: string
  kestrelContact: string
  acmeContact: string
  kestrelStage: string
  acmeStage: string
  kestrelRep: string
  acmeRep: string
  kestrelUser: string
}
let ids: Ids

const first = async (text: string, values: unknown[]) => (await sql<{ id: string }>(text, values))[0].id

beforeAll(async () => {
  const o = await orgs()
  const kestrel = o.kestrel.id
  const acme = o.acme.id
  ids = {
    kestrel,
    acme,
    kestrelCompany: await first('select id from companies where org_id = $1 limit 1', [kestrel]),
    acmeCompany: await first('select id from companies where org_id = $1 limit 1', [acme]),
    kestrelContact: await first('select id from contacts where org_id = $1 limit 1', [kestrel]),
    acmeContact: await first('select id from contacts where org_id = $1 limit 1', [acme]),
    kestrelStage: await first('select id from stages where org_id = $1 limit 1', [kestrel]),
    acmeStage: await first('select id from stages where org_id = $1 limit 1', [acme]),
    kestrelRep: await first("select user_id as id from memberships where org_id = $1 and role = 'rep' limit 1", [kestrel]),
    acmeRep: await first("select user_id as id from memberships where org_id = $1 and role = 'rep' limit 1", [acme]),
    kestrelUser: await first('select id from users limit 1', []),
  }
})

const insertContact = 'insert into contacts (org_id, company_id, owner_id, name, email) values ($1, $2, $3, $4, $5)'
const insertDeal = 'insert into deals (org_id, contact_id, company_id, owner_id, stage_id, title, value_cents) values ($1, $2, $3, $4, $5, $6, $7)'

describe('A02 Model the CRM', () => {
  test('A02.1 the migrations build every table of the contract, and the seed fills them', async () => {
    const counts = await sql<Record<string, number>>(
      `select (select count(*)::int from orgs) as orgs, (select count(*)::int from users) as users, (select count(*)::int from memberships) as memberships,
              (select count(*)::int from companies) as companies, (select count(*)::int from contacts) as contacts,
              (select count(*)::int from stages) as stages, (select count(*)::int from deals) as deals`,
    )
    const c = counts[0]
    expect(c.orgs, 'the seeded organisations (other tests may add their own)').toBeGreaterThanOrEqual(4)
    expect(c.memberships, 'memberships').toBeGreaterThan(40)
    expect(c.stages, 'stages (6 per org)').toBe(24)
    expect(c.contacts, 'contacts').toBeGreaterThanOrEqual(10_000)
    expect(c.deals, 'deals').toBeGreaterThanOrEqual(4_000)
  })

  test('A02.2 a contact cannot point at a company of another organisation (SQLSTATE 23503)', async () => {
    await inRolledBackTransaction(async (c) => {
      expect(await stateOf(c, insertContact, [ids.kestrel, ids.kestrelCompany, null, 'Control', 'control@x.test']), 'control: own company').toBe('no error')
      expect(await stateOf(c, insertContact, [ids.kestrel, ids.acmeCompany, null, 'Leak', 'leak@x.test']), "another org's company").toBe('23503')
    })
  })

  test("A02.3 a contact's owner must be a member of the contact's organisation (SQLSTATE 23503)", async () => {
    await inRolledBackTransaction(async (c) => {
      expect(await stateOf(c, insertContact, [ids.kestrel, null, ids.kestrelRep, 'Control', 'control2@x.test']), 'control: a member').toBe('no error')
      expect(await stateOf(c, insertContact, [ids.kestrel, null, ids.acmeRep, 'Leak', 'leak2@x.test']), "a rep of another org").toBe('23503')
    })
  })

  test('A02.4 a deal cannot mix organisations: contact, company, owner and stage must all belong to the deal\'s org (SQLSTATE 23503)', async () => {
    await inRolledBackTransaction(async (c) => {
      const ok = [ids.kestrel, ids.kestrelContact, ids.kestrelCompany, ids.kestrelRep, ids.kestrelStage, 'Control deal', 100_00]
      expect(await stateOf(c, insertDeal, ok), 'control: everything from one org').toBe('no error')
      const foreign: [string, unknown[]][] = [
        ['contact', [ids.kestrel, ids.acmeContact, ids.kestrelCompany, ids.kestrelRep, ids.kestrelStage, 'x', 1]],
        ['company', [ids.kestrel, ids.kestrelContact, ids.acmeCompany, ids.kestrelRep, ids.kestrelStage, 'x', 1]],
        ['owner', [ids.kestrel, ids.kestrelContact, ids.kestrelCompany, ids.acmeRep, ids.kestrelStage, 'x', 1]],
        ['stage', [ids.kestrel, ids.kestrelContact, ids.kestrelCompany, ids.kestrelRep, ids.acmeStage, 'x', 1]],
      ]
      for (const [what, values] of foreign) expect(await stateOf(c, insertDeal, values), `deal with another org's ${what}`).toBe('23503')
    })
  })

  test('A02.5 a membership role is one of admin, manager, rep', async () => {
    await inRolledBackTransaction(async (c) => {
      const user = await c.query("insert into users (email, name) values ('role-test@x.test', 'Role Test') returning id")
      const userId = user.rows[0].id
      expect(await stateOf(c, "insert into memberships (org_id, user_id, role) values ($1, $2, 'rep')", [ids.kestrel, userId]), 'control').toBe('no error')
      const bad = await stateOf(c, "insert into memberships (org_id, user_id, role) values ($1, $2, 'owner')", [ids.acme, userId])
      // 22P02 = invalid input value for enum; 23514 = check violation. Either design is fine.
      expect(['22P02', '23514'], 'role "owner" must be refused').toContain(bad)
    })
  })

  test('A02.6 emails: unique ignoring case for users, unique per organisation (ignoring case) for contacts, and the same email may exist in two organisations', async () => {
    await inRolledBackTransaction(async (c) => {
      await c.query("insert into users (email, name) values ('Ada@Example.test', 'Ada')")
      expect(await stateOf(c, "insert into users (email, name) values ('ada@example.test', 'Ada Two')"), 'user email, different case').toBe('23505')
      await c.query(insertContact, [ids.kestrel, null, null, 'First', 'Shared@Example.test'])
      expect(await stateOf(c, insertContact, [ids.kestrel, null, null, 'Second', 'shared@example.test']), 'contact email, same org, different case').toBe('23505')
      expect(await stateOf(c, insertContact, [ids.acme, null, null, 'Other org', 'shared@example.test']), 'same email in another org').toBe('no error')
      await c.query(insertContact, [ids.kestrel, null, null, 'No email one', null])
      expect(await stateOf(c, insertContact, [ids.kestrel, null, null, 'No email two', null]), 'a second contact without an email is fine').toBe('no error')
    })
  })

  test('A02.7 organisation slugs are unique, and stage positions are unique within an organisation', async () => {
    await inRolledBackTransaction(async (c) => {
      expect(await stateOf(c, "insert into orgs (slug, name) values ('kestrel', 'Impostor')"), 'duplicate slug').toBe('23505')
      expect(await stateOf(c, "insert into orgs (slug, name) values ('fresh-org', 'Fresh')"), 'control').toBe('no error')
      expect(await stateOf(c, "insert into stages (org_id, name, position, kind) values ($1, 'Duplicate position', 1, 'open')", [ids.kestrel]), 'position 1 is taken').toBe('23505')
      expect(await stateOf(c, "insert into stages (org_id, name, position, kind) values ($1, 'Seventh', 7, 'open')", [ids.kestrel]), 'control: a free position').toBe('no error')
      expect(await stateOf(c, "insert into stages (org_id, name, position, kind) values ($1, 'Bogus kind', 8, 'maybe')", [ids.kestrel]), 'kind is open, won or lost').not.toBe('no error')
    })
  })

  test('A02.8 a deal cannot have a negative value', async () => {
    await inRolledBackTransaction(async (c) => {
      const base = [ids.kestrel, ids.kestrelContact, ids.kestrelCompany, ids.kestrelRep, ids.kestrelStage, 'Value test']
      expect(await stateOf(c, insertDeal, [...base, 0]), 'zero is allowed').toBe('no error')
      expect(await stateOf(c, insertDeal, [...base, -1]), 'minus one is not').toBe('23514')
    })
  })

  test('A02.9 every tenant table has a NOT NULL org_id, and inserting without it fails', async () => {
    const tenantTables = ['memberships', 'companies', 'contacts', 'stages', 'deals']
    const rows = await sql<{ table_name: string; is_nullable: string }>(
      `select table_name, is_nullable from information_schema.columns where table_schema = 'public' and column_name = 'org_id' and table_name = any($1)`,
      [tenantTables],
    )
    for (const table of tenantTables) {
      const row = rows.find((r) => r.table_name === table)
      expect(row, `${table}.org_id exists`).toBeDefined()
      expect(row?.is_nullable, `${table}.org_id is NOT NULL`).toBe('NO')
    }
    await inRolledBackTransaction(async (c) => {
      expect(await stateOf(c, "insert into contacts (name) values ('No org')"), 'contact without org').toBe('23502')
    })
  })

  test('A02.10 ids are generated by the database as time-ordered uuidv7 values', async () => {
    await inRolledBackTransaction(async (c) => {
      const { rows } = await c.query("insert into orgs (slug, name) values ('id-test-1', 'A'), ('id-test-2', 'B') returning id")
      for (const row of rows) expect(String(row.id).charAt(14), 'UUID version nibble').toBe('7')
      expect(String(rows[0].id) < String(rows[1].id), 'two ids from one statement sort in insertion order').toBe(true)
    })
  })
})
