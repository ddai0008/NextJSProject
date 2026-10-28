import pg from 'pg'
import { env } from './env'

/** `session` numbers the connection a statement went out on, so a test can tell which statements belong together. */
export type RecordedQuery = { text: string; values: unknown[]; session?: number }

const sessions = new WeakMap<object, number>()
let sessionCount = 0
const sessionOf = (client: object) => {
  if (!sessions.has(client)) sessions.set(client, sessionCount++)
  return sessions.get(client)!
}

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
    if (typeof first === 'string') queries.push({ text: first, values: Array.isArray(args[1]) ? args[1] : [], session: sessionOf(this as object) })
    // Drizzle calls query(config, values): the values can be in the second argument even when the first is a config object.
    else if (first && typeof first.text === 'string') queries.push({ text: first.text, values: first.values ?? (Array.isArray(args[1]) ? args[1] : []), session: sessionOf(this as object) })
    return original.apply(this, args)
  }
  try {
    return { result: await fn(), queries }
  } finally {
    proto.query = original
  }
}

export type PlanNode = { nodeType: string; relation?: string; index?: string }

/**
 * Every node of the plan Postgres would use for this statement (EXPLAIN without ANALYZE: the statement is not executed).
 *
 * Sequential scans are switched off for the session (`avoidSeqScan`, on by default). The question a plan test asks is "can an index serve
 * this query?", not "does the planner happen to prefer it on a small test table?": on a small table a sequential scan can legitimately be
 * the cheapest plan, and the answer would then depend on the amount of data. With sequential scans off, a `Seq Scan` that is still in the
 * plan means no index could do the job.
 */
export async function planOf(query: RecordedQuery, { url = env.dbUrl(), avoidSeqScan = true }: { url?: string; avoidSeqScan?: boolean } = {}): Promise<PlanNode[]> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    if (avoidSeqScan) await client.query('set enable_seqscan = off')
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

/**
 * Replays, as the APPLICATION'S database user (not the owner: owners are exempt from row-level security, so what they see says nothing about what the app runs),
 * what the code did on a connection before `queries[index]` in the same unit of work (BEGIN, whatever it did to say which tenant this is, and so on), and then calls
 * `fn` on that session. That makes a check independent of the way tenants are isolated: if a statement on the connection establishes the context, the replay does too.
 * Everything runs in a transaction that is rolled back, so replaying cannot change data.
 */
async function inReplayedUnit<T>(queries: RecordedQuery[], index: number, url: string, fn: (client: pg.Client, target: RecordedQuery) => Promise<T>): Promise<T> {
  const target = queries[index]
  const before: RecordedQuery[] = []
  for (let i = index - 1; i >= 0; i--) {
    if (queries[i].session !== target.session) continue
    if (/^\s*(commit|rollback|end)\b/i.test(queries[i].text)) break
    before.unshift(queries[i])
  }
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    if (!before.length || !/^\s*(begin|start transaction)\b/i.test(before[0].text)) await client.query('begin')
    for (const q of before) await client.query(q.text, q.values as any[])
    return await fn(client, target)
  } finally {
    await client.query('rollback').catch(() => undefined)
    await client.end()
  }
}

/** The plan of `queries[index]` for the application's user, after replaying its unit of work (see inReplayedUnit). */
export async function planOfReplayed(queries: RecordedQuery[], index: number, { url = env.appDbUrl(), avoidSeqScan = true }: { url?: string; avoidSeqScan?: boolean } = {}): Promise<PlanNode[]> {
  return inReplayedUnit(queries, index, url, async (client, target) => {
    if (avoidSeqScan) await client.query('set enable_seqscan = off')
    const { rows } = await client.query(`explain (format json) ${target.text}`, target.values as any[])
    const nodes: PlanNode[] = []
    const walk = (node: any) => {
      nodes.push({ nodeType: node['Node Type'], relation: node['Relation Name'], index: node['Index Name'] })
      for (const child of node.Plans ?? []) walk(child)
    }
    walk(rows[0]['QUERY PLAN'][0].Plan)
    return nodes
  })
}

/** What `queries[index]` does for the application's user after replaying its unit of work, optionally with other parameter values: how many rows it returned, or its SQLSTATE. */
export async function outcomeReplayed(queries: RecordedQuery[], index: number, { values, url = env.appDbUrl() }: { values?: unknown[]; url?: string } = {}): Promise<{ rows: number } | { error: string }> {
  return inReplayedUnit(queries, index, url, (client, target) =>
    client.query(target.text, (values ?? target.values) as any[]).then(
      (result) => ({ rows: result.rowCount ?? result.rows.length }),
      (error: { code?: string; message?: string }) => ({ error: String(error.code ?? error.message) }),
    ),
  )
}

export const describePlan = (nodes: PlanNode[]) =>
  nodes.map((n) => `${n.nodeType}${n.relation ? ` on ${n.relation}` : ''}${n.index ? ` using ${n.index}` : ''}`).join(' > ')

/** SELECTs that read `table` (ignores transaction control, SET, and the like). */
export const selectsFrom = (queries: RecordedQuery[], table: string) =>
  queries.filter((q) => /^\s*(with|select)\b/i.test(q.text) && new RegExp(`\\b"?${table}"?\\b`, 'i').test(q.text))
