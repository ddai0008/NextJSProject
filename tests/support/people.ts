import { sql } from './db'
import type { RequestContext } from '../../lib/dal/types'

/** The request context of a seeded person in an organisation (the seed gives each organisation 1 admin, 2 managers, 9 reps). */
export async function ctxOf(email: string, orgSlug: string): Promise<RequestContext> {
  const [row] = await sql<RequestContext>(
    `select u.id as "userId", o.id as "orgId", o.slug as "orgSlug", m.role as role
       from users u join memberships m on m.user_id = u.id join orgs o on o.id = m.org_id
      where u.email = $1 and o.slug = $2`,
    [email, orgSlug],
  )
  if (!row) throw new Error(`${email} is not a member of ${orgSlug} in the test database`)
  return row
}

export const seeded = {
  acme: { admin: 'admin@acme.test', manager: 'manager1@acme.test', managerTwo: 'manager2@acme.test', rep: 'rep1@acme.test', otherRep: 'rep2@acme.test' },
  kestrel: { admin: 'admin@kestrel.test', manager: 'manager1@kestrel.test', rep: 'rep1@kestrel.test' },
  /** a rep in kestrel AND a manager in acme: roles belong to memberships, not to people */
  consultant: 'consultant@pipewise.test',
}
