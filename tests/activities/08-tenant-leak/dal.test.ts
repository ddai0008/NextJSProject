import { relative } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { RequestContext } from '../../../lib/dal/types'
import { sql } from '../../support/db'
import { env } from '../../support/env'
import { sourceFiles } from '../../support/imports'
import { ctxOf, seeded } from '../../support/people'
import { exportedFunctions } from '../../support/signatures'

// The generic half of the incident. A08 gives you three leaks to close; the next one will not be in a place anyone thinks of. So these tests do not name
// functions: they read every exported function of the data access layer and require two things of ALL of them.

// session.ts is the one module that works out the context; types and errors hold no data operations. Cursor helpers are not async.
const dalFiles = () => sourceFiles(['lib/dal']).filter((file) => !/[\\/](session|types|errors)\.ts$/.test(file))
const isContext = (parameter: { name: string; type: string } | undefined) => !!parameter && (/^_?ctx$/.test(parameter.name) || /RequestContext/.test(parameter.type))
const looksLikeAnId = (name: string) => /^(id|[a-z]+Id)$/.test(name)

describe('A08 the data access layer, as a whole', () => {
  test('A08.6 every async function a DAL module exports takes the RequestContext first (no function can be called without saying who is asking)', () => {
    const files = dalFiles()
    expect(files.length, 'DAL modules found').toBeGreaterThan(3)
    const violations: string[] = []
    for (const file of files) {
      for (const fn of exportedFunctions(file)) {
        if (fn.isAsync && !isContext(fn.parameters[0])) violations.push(`${relative(env.root(), file)}: ${fn.name}(${fn.parameters.map((p) => p.name).join(', ')})`)
      }
    }
    expect(violations, 'these functions can be called by anyone about anything: give them a context, or make them private').toEqual([])
  })
})

// Rows that belong to ACME, with strings nobody else could know. A caller from KESTREL, with the strongest role there (an admin, so that a missing role check
// cannot hide a missing organisation check), is given each of their ids in turn.
const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const secret = {
  contact: `Acme Secret Contact ${token}`,
  email: `secret.${token}@acme-private.test`,
  company: `Acme Secret Company ${token}`,
  deal: `Acme Secret Deal ${token}`,
  person: `acme-only.${token}@acme-private.test`,
}
let acmeIds: { contact: string; company: string; deal: string; stage: string; user: string; org: string }
let kestrelAdmin: RequestContext

beforeAll(async () => {
  const [org] = await sql<{ id: string }>("select id from orgs where slug = 'acme'")
  const [rep] = await sql<{ id: string }>('select id from users where email = $1', [seeded.acme.rep])
  // Rows with nothing pointing at them and nothing they point at except an owner, so that a destructive call on them would SUCCEED if nothing stopped it
  // (a foreign key from a deal to the contact, say, would make an unscoped delete fail by luck and hide the bug).
  const [user] = await sql<{ id: string }>("insert into users (email, name) values ($1, 'Acme Only Person') returning id", [secret.person])
  await sql("insert into memberships (org_id, user_id, role) values ($1, $2, 'rep')", [org.id, user.id])
  const [company] = await sql<{ id: string }>('insert into companies (org_id, name) values ($1, $2) returning id', [org.id, secret.company])
  const [contact] = await sql<{ id: string }>('insert into contacts (org_id, owner_id, name, email) values ($1, $2, $3, $4) returning id', [org.id, rep.id, secret.contact, secret.email])
  const [stage] = await sql<{ id: string }>('select id from stages where org_id = $1 order by position limit 1', [org.id])
  const [deal] = await sql<{ id: string }>('insert into deals (org_id, owner_id, stage_id, title, value_cents) values ($1, $2, $3, $4, 1000) returning id', [org.id, rep.id, stage.id, secret.deal])
  acmeIds = { org: org.id, user: user.id, company: company.id, contact: contact.id, stage: stage.id, deal: deal.id }
  kestrelAdmin = await ctxOf(seeded.kestrel.admin, 'kestrel')
})
afterAll(async () => {
  if (!acmeIds) return
  await sql('delete from deals where id = $1', [acmeIds.deal])
  await sql('delete from contacts where id = $1', [acmeIds.contact])
  await sql('delete from companies where id = $1', [acmeIds.company])
  await sql('delete from memberships where user_id = $1', [acmeIds.user])
  await sql('delete from users where id = $1', [acmeIds.user])
})

/** Everything a caller could change or delete about the rows above, as text: if it differs afterwards, something wrote. */
async function fingerprint(): Promise<string> {
  const rows = await sql<{ t: string }>(
    `select row_to_json(c)::text as t from contacts c where c.id = $1
     union all select row_to_json(c)::text from companies c where c.id = $2
     union all select row_to_json(d)::text from deals d where d.id = $3
     union all select row_to_json(m)::text from memberships m where m.org_id = $4 and m.user_id = $5
     union all select (select count(*) from contacts where org_id = $4) || '/' || (select count(*) from deals where org_id = $4) || '/' || (select count(*) from companies where org_id = $4) || '/' || (select count(*) from memberships where org_id = $4)
     order by 1`,
    [acmeIds.contact, acmeIds.company, acmeIds.deal, acmeIds.org, acmeIds.user],
  )
  return rows.map((row) => row.t).join('\n')
}

/** A value for a parameter that is not the context or the id, chosen from its declared type, so that a function that WOULD write has something to write. */
function sampleFor(type: string): unknown {
  const t = type.trim()
  if (/^string\b/.test(t)) return 'idor-check'
  if (/^number\b/.test(t)) return 1
  if (/^boolean\b/.test(t)) return true
  if (/\bRole\b/.test(t)) return 'admin' // the most dangerous value: promoting someone is what an attacker would try
  if (/^\{|Input|Changes|Patch|Values|Data/.test(t)) return { name: 'idor-check', title: 'idor-check', email: null, valueCents: 1, role: 'rep' }
  return undefined
}

describe('A08 every DAL function that takes an id, asked about ANOTHER organisation\'s rows', () => {
  test('A08.7 nothing of Acme is returned and nothing of Acme changes when a Kestrel admin names its ids', async () => {
    const targets = { contact: acmeIds.contact, company: acmeIds.company, deal: acmeIds.deal, stage: acmeIds.stage, user: acmeIds.user }
    const everything = Object.values(secret)
    const walked: string[] = []
    const problems: string[] = []
    let baseline = await fingerprint()
    expect(baseline, 'the rows exist').toContain(secret.contact)

    for (const file of dalFiles()) {
      const module = (await import(/* @vite-ignore */ file)) as Record<string, unknown>
      for (const fn of exportedFunctions(file)) {
        const [first, second, ...rest] = fn.parameters
        if (!fn.isAsync || !isContext(first) || !second || !looksLikeAnId(second.name) || typeof module[fn.name] !== 'function') continue
        walked.push(`${relative(env.root(), file)}: ${fn.name}`)
        for (const [kind, id] of Object.entries(targets)) {
          const label = `${fn.name}(kestrel admin, ${kind} id of acme)`
          let outcome = ''
          try {
            outcome = JSON.stringify(await (module[fn.name] as (...args: unknown[]) => Promise<unknown>)(kestrelAdmin, id, ...rest.map((parameter) => sampleFor(parameter.type)))) ?? ''
          } catch (error) {
            outcome = `threw ${error instanceof Error ? error.message : String(error)}`
          }
          const leaked = everything.filter((s) => outcome.includes(s))
          if (leaked.length > 0) problems.push(`${label} handed back: ${leaked.join(', ')}`)
          const after = await fingerprint()
          if (after !== baseline) {
            problems.push(`${label} CHANGED rows of acme`)
            baseline = after // later calls are compared with what is there now; one report per function is enough
            break
          }
        }
      }
    }
    expect(walked.length, `functions with a context and an id that were called: ${walked.join('; ')}`).toBeGreaterThanOrEqual(6)
    expect(problems).toEqual([])
  })
})
