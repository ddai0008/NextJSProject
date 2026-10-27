import { sql } from './db'
import { ctxOf } from './people'
import type { RequestContext } from '../../lib/dal/types'

/**
 * A request context for a REAL member of an organisation: the seeded admin, manager or rep (the seed gives each organisation 1 admin, 2 managers, 9 reps).
 * It must be a real member: since A07 a contact you create is owned by you, and the database refuses an owner who is not a member.
 */
export async function contextFor(orgSlug: string, role: RequestContext['role'] = 'admin'): Promise<RequestContext> {
  const email = role === 'admin' ? `admin@${orgSlug}.test` : role === 'manager' ? `manager1@${orgSlug}.test` : `rep1@${orgSlug}.test`
  return ctxOf(email, orgSlug)
}

/** The ids of an organisation's contacts in the order the list must show them. */
export async function expectedOrder(orgId: string, sort: 'created' | 'name' = 'created', where = 'true', params: unknown[] = []): Promise<{ id: string; email: string | null; name: string }[]> {
  const order = sort === 'created' ? 'created_at desc, id desc' : 'name asc, id asc'
  return sql(`select id, email, name from contacts where org_id = $1 and (${where}) order by ${order}`, [orgId, ...params])
}
