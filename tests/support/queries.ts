import pg from 'pg'
import { env } from './env'

export type RecordedQuery = { text: string; values: unknown[] }

/**
 * Runs `fn` and returns the SQL the code under test sent to Postgres while it ran. It wraps `pg.Client.prototype.query`, which
 * every pool (and so Drizzle) goes through. It sees this process only: the app started by the runner is another process; use
 * pg_stat_statements (./statements.ts) for that.
 */
export async function recordQueries<T>(fn: () => Promise<T>): Promise<{ result: T; queries: RecordedQuery[] }> {
  const queries: RecordedQuery[] = []
  const proto = pg.Client.prototype as any
  const original = proto.query
  proto.query = function (this: unknown, ...args: any[]) {
    const first = args[0]
    if (typeof first === 'string') queries.push({ text: first, values: Array.isArray(args[1]) ? args[1] : [] })
    // Drizzle calls query(config, values): the values can be in the second argument even when the first is a config object.
    else if (first && typeof first.text === 'string') queries.push({ text: first.text, values: first.values ?? (Array.isArray(args[1]) ? args[1] : []) })
    return original.apply(this, args)
  }
  try {
    return { result: await fn(), queries }
  } finally {
    proto.query = original
  }
}

export type PlanNode = { nodeType: string; relation?: string; index?: string }

/** Every node of the plan Postgres would use for this statement (EXPLAIN without ANALYZE: the statement is not executed). */
export async function planOf(query: RecordedQuery, url: string = env.dbUrl()): Promise<PlanNode[]> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    const { rows } = await client.query(`explain (format json) ${query.text}`, query.values as any[])
    const nodes: PlanNode[] = []
    const walk = (node: any) => {
      nodes.push({ nodeType: node['Node Type'], relation: node['Relation Name'], index: node['Index Name'] })
      for (const child of node.Plans ?? []) walk(child)
    }
    walk(rows[0]['QUERY PLAN'][0].Plan)
    return nodes
  } finally {
    await client.end()
  }
}

export const describePlan = (nodes: PlanNode[]) =>
  nodes.map((n) => `${n.nodeType}${n.relation ? ` on ${n.relation}` : ''}${n.index ? ` using ${n.index}` : ''}`).join(' > ')

/** SELECTs that read `table` (ignores transaction control, SET, and the like). */
export const selectsFrom = (queries: RecordedQuery[], table: string) =>
  queries.filter((q) => /^\s*(with|select)\b/i.test(q.text) && new RegExp(`\\b"?${table}"?\\b`, 'i').test(q.text))
