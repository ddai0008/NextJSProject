import { createHash } from 'node:crypto'
import { sql } from './db'

/** Every (table, column) of the public schema whose text contains `needle`. Used to prove that a secret is stored nowhere in the clear. */
export async function whereStored(needle: string): Promise<string[]> {
  const columns = await sql<{ table_name: string; column_name: string }>(
    `select c.table_name, c.column_name
       from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
      where c.table_schema = 'public' and t.table_type = 'BASE TABLE'`,
  )
  const hits: string[] = []
  for (const { table_name, column_name } of columns) {
    const [row] = await sql<{ n: number }>(`select count(*)::int as n from "${table_name}" where position($1 in "${column_name}"::text) > 0`, [needle])
    if (row.n > 0) hits.push(`${table_name}.${column_name}`)
  }
  return hits
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/

/**
 * The strings stored about one user that look like a credential: every row, in any table, that contains the user's id as a value; minus the
 * values that are plainly identity or time (ids, the email, the name, timestamps) and anything short. What is left is the password hash,
 * wherever the implementation keeps it (a column of `users`, a `credentials` table, ...).
 */
export async function credentialValuesOf(userId: string, identity: string[]): Promise<string[]> {
  const tables = await sql<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`)
  const found: string[] = []
  for (const { table_name } of tables) {
    const rows = await sql<{ row: Record<string, unknown> }>(
      `select to_jsonb(t) as row from "${table_name}" t where exists (select 1 from jsonb_each_text(to_jsonb(t)) e where e.value = $1)`,
      [userId],
    )
    for (const { row } of rows) {
      for (const value of Object.values(row)) {
        if (typeof value !== 'string' || value.length < 20) continue
        if (UUID.test(value) || TIMESTAMP.test(value) || identity.includes(value)) continue
        found.push(value)
      }
    }
  }
  return found
}

/** Hex and base64 of the common fast digests of a password: none of them may be what is stored. */
export function bareDigestsOf(secret: string): string[] {
  return ['md5', 'sha1', 'sha256', 'sha512'].flatMap((algorithm) => {
    const digest = createHash(algorithm).update(secret).digest()
    return [digest.toString('hex'), digest.toString('base64'), digest.toString('base64url')]
  })
}

export type ParsedCookie = { name: string; value: string; attributes: Record<string, string | true> }

export function parseSetCookie(header: string): ParsedCookie {
  const [pair, ...rest] = header.split(';').map((part) => part.trim())
  const eq = pair.indexOf('=')
  const attributes: Record<string, string | true> = {}
  for (const part of rest) {
    const i = part.indexOf('=')
    if (i === -1) attributes[part.toLowerCase()] = true
    else attributes[part.slice(0, i).toLowerCase()] = part.slice(i + 1)
  }
  return { name: pair.slice(0, eq), value: pair.slice(eq + 1), attributes }
}
