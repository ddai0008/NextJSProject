// The vocabulary shared by the data access layer (DAL) and everything that calls it. Given: do not change it.

/** Ascending privilege: a manager can do everything a rep can, an admin everything a manager can. */
export const ROLES = ['rep', 'manager', 'admin'] as const
export type Role = (typeof ROLES)[number]

export const atLeast = (role: Role, minimum: Role): boolean => ROLES.indexOf(role) >= ROLES.indexOf(minimum)

/** Who is signed in. Nothing about an organisation: a user can belong to several. */
export type Session = { userId: string; email: string }

/**
 * Who is acting, in which organisation, with which role. Built once per request by `requireRole()` (lib/dal/session.ts) and passed
 * to every DAL function as its first argument. A DAL function trusts nothing but this.
 */
export type RequestContext = { userId: string; orgId: string; orgSlug: string; role: Role }
