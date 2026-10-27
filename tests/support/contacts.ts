import { sql } from './db'
import type { RequestContext } from '../../lib/dal/types'

/** A request context for an organisation, built directly (the DAL functions take one as their first argument). */
export async function contextFor(orgSlug: string, role: RequestContext['role'] = 'admin'): Promise<RequestContext> {
  const [org] = await sql<{ id: string }>('select id from orgs where slug = $1', [orgSlug])
  if (!org) throw new Error(`no organisation "${orgSlug}" in the test database`)
  return { userId: '00000000-0000-0000-0000-000000000000', orgId: org.id, orgSlug, role }
}

/** The ids of an organisation's contacts in the order the list must show them. */
export async function expectedOrder(orgId: string, sort: 'created' | 'name' = 'created', where = 'true', params: unknown[] = []): Promise<{ id: string; email: string | null; name: string }[]> {
  const order = sort === 'created' ? 'created_at desc, id desc' : 'name asc, id asc'
  return sql(`select id, email, name from contacts where org_id = $1 and (${where}) order by ${order}`, [orgId, ...params])
}
