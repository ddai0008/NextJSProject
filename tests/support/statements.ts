import { withDb } from './db'

// pg_stat_statements counts every statement the cluster ran, whichever process sent it. That is how a test sees how many queries
// the running app (a separate process) executed while it served a request.

export async function resetStatements() {
  await withDb((c) => c.query('select pg_stat_statements_reset()'))
}

/** Total calls of statements that match, since the last reset. `match` is a RegExp or a predicate on the (normalised) statement text. */
export async function callsMatching(match: RegExp | ((statement: string) => boolean)): Promise<number> {
  const rows = await withDb(async (c) => (await c.query('select query, calls::int as calls from pg_stat_statements where dbid = (select oid from pg_database where datname = current_database())')).rows)
  const test = typeof match === 'function' ? match : (statement: string) => match.test(statement)
  return rows.filter((r) => test(r.query)).reduce((sum: number, r: any) => sum + r.calls, 0)
}
