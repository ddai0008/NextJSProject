import pg from 'pg'
import { env } from './env'

/** Runs `fn` with a connection to this run's database as the admin user, then closes it. */
export async function withDb<T>(fn: (client: pg.Client) => Promise<T>, url: string = env.dbUrl()): Promise<T> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export async function sql<T extends pg.QueryResultRow = Record<string, any>>(text: string, values: unknown[] = [], url?: string): Promise<T[]> {
  return withDb(async (c) => (await c.query<T>(text, values)).rows, url)
}

/**
 * The 5-character SQLSTATE of a database error, wherever it is wrapped. Drizzle wraps the driver error in a
 * DrizzleQueryError, so the code is on `error.cause`, not on `error` (spike S2): `error.code` is undefined.
 */
export function sqlState(error: unknown): string | undefined {
  let current: any = error
  for (let depth = 0; depth < 6 && current; depth++) {
    if (typeof current.code === 'string' && /^[0-9A-Z]{5}$/.test(current.code)) return current.code
    current = current.cause
  }
  return undefined
}

export async function sqlStateOf(promise: Promise<unknown>): Promise<string | 'no error'> {
  try {
    await promise
    return 'no error'
  } catch (error) {
    return sqlState(error) ?? `other error: ${String((error as Error)?.message).slice(0, 200)}`
  }
}

/** The four organisations the seed creates. Tests may create others of their own; helpers that ask "which organisations are there" mean these. */
export const SEEDED_ORGS = ['kestrel', 'acme', 'lumen', 'harbor'] as const

export type OrgRow = { id: string; slug: string; name: string }

export async function orgs(): Promise<Record<string, OrgRow>> {
  const rows = await sql<OrgRow>('select id, slug, name from orgs where slug = any($1) order by slug', [SEEDED_ORGS])
  return Object.fromEntries(rows.map((r) => [r.slug, r]))
}

/** The org with the fewest contacts: small enough to walk page by page. */
export async function smallestOrg(): Promise<OrgRow & { contacts: number }> {
  const rows = await sql<OrgRow & { contacts: number }>(
    `select o.id, o.slug, o.name, count(c.*)::int as contacts from orgs o left join contacts c on c.org_id = o.id where o.slug = any($1) group by o.id order by 4 asc, o.slug limit 1`,
    [SEEDED_ORGS],
  )
  return rows[0]
}

/**
 * Runs `fn` inside a transaction that is always rolled back, so a test can insert what it likes and leave the database as it found it.
 */
export async function inRolledBackTransaction<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  return withDb(async (client) => {
    await client.query('begin')
    try {
      return await fn(client)
    } finally {
      await client.query('rollback')
    }
  })
}

/** Runs one statement inside a savepoint and returns its SQLSTATE ("no error" if it worked); the transaction stays usable afterwards. */
export async function stateOf(client: pg.Client, text: string, values: unknown[] = []): Promise<string> {
  await client.query('savepoint attempt')
  try {
    await client.query(text, values)
    return 'no error'
  } catch (error) {
    return sqlState(error) ?? `other error: ${String((error as Error).message).slice(0, 160)}`
  } finally {
    await client.query('rollback to savepoint attempt')
  }
}
