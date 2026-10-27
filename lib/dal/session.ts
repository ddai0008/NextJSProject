import 'server-only'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { orgs } from '@/db/schema'
import type { RequestContext, Role, Session } from './types'

// The two functions the rest of the app uses to ask "who is this?". Everything else must go through them (A05 and A07 make them real,
// A10 re-implements them on a library and nothing that calls them may change).

/**
 * TODO(A05): who is signed in, or null.
 * STUB: nobody is ever signed in.
 */
export async function getSession(): Promise<Session | null> {
  return null
}

/**
 * TODO(A07): the signed-in member of the organisation `orgSlug`, with at least role `minimum`; otherwise it refuses.
 * STUB: it trusts the URL. It only checks that the organisation exists and then pretends you are its admin.
 * That is fine while you build the list (A03) and the forms (A04), and it is exactly what A07 removes.
 */
export async function requireRole(orgSlug: string, _minimum: Role): Promise<RequestContext> {
  const org = await db.query.orgs.findFirst({ where: eq(orgs.slug, orgSlug) })
  if (!org) notFound()
  return { userId: '00000000-0000-0000-0000-000000000000', orgId: org.id, orgSlug, role: 'admin' }
}
