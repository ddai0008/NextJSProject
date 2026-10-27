import 'server-only'
import type { ContactDTO } from './contacts'
import type { RequestContext } from './types'

// Operations on contacts that only managers and admins may perform (A07).

/** TODO(A07): delete a contact of the organisation. Managers and admins only (ForbiddenError otherwise). true if it was deleted, false if there is no such contact in the organisation. */
export async function deleteContact(_ctx: RequestContext, _id: string): Promise<boolean> {
  throw new Error('TODO(A07): deleteContact')
}

/**
 * TODO(A07): give a contact a new owner. Managers and admins only. The new owner must be a MEMBER of the organisation: the database already refuses anyone else (A02);
 * let that refusal reach the caller. null if there is no such contact in the organisation.
 */
export async function reassignContact(_ctx: RequestContext, _id: string, _ownerId: string): Promise<ContactDTO | null> {
  throw new Error('TODO(A07): reassignContact')
}
