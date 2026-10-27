import 'server-only'
import type { RequestContext, Role } from './types'

/** A member of the organisation, as an admin sees them. Nothing secret: no password hash, no session. */
export type MemberDTO = { userId: string; email: string; name: string; role: Role }

/** TODO(A07): the members of the organisation of the context. Admins only (ForbiddenError otherwise). */
export async function listMembers(_ctx: RequestContext): Promise<MemberDTO[]> {
  throw new Error('TODO(A07): listMembers')
}

/**
 * TODO(A07): change a member's role. Admins only. null if the user is not a member of this organisation.
 * The last admin of an organisation cannot be demoted (ForbiddenError): an organisation with no admin cannot be repaired from inside.
 */
export async function changeRole(_ctx: RequestContext, _userId: string, _role: Role): Promise<MemberDTO | null> {
  throw new Error('TODO(A07): changeRole')
}
