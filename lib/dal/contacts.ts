import 'server-only'
import type { RequestContext } from './types'

// Contacts, as the rest of the app may see them. The names, parameters and result shapes below are the contract the tests call:
// keep them, replace the bodies. Every function takes the RequestContext first and works only inside ctx.orgId.

export type ContactDTO = {
  id: string
  name: string
  email: string | null
  companyName: string | null
  ownerId: string | null
  createdAt: string // ISO 8601
}

export type ContactSort = 'created' | 'name'

export type ContactQuery = {
  /** Case-insensitive substring of the name or the email. */
  q?: string
  /** `created`: newest first (the default). `name`: A to Z. */
  sort?: ContactSort
  /** Opaque cursor from the previous page's `nextCursor`. A bad or foreign cursor is ignored (first page), never an error. */
  cursor?: string
}

export type ContactPage = { rows: ContactDTO[]; nextCursor: string | null }

export type ContactInput = { name: string; email?: string | null; companyId?: string | null }

/** TODO(A03): one page (25 rows) of the organisation's contacts. */
export async function listContacts(_ctx: RequestContext, _query: ContactQuery): Promise<ContactPage> {
  throw new Error('TODO(A03): listContacts')
}

/** TODO(A04): how many contacts the organisation has. */
export async function countContacts(_ctx: RequestContext): Promise<number> {
  throw new Error('TODO(A04): countContacts')
}

/** TODO(A04) */
export async function createContact(_ctx: RequestContext, _input: ContactInput): Promise<ContactDTO> {
  throw new Error('TODO(A04): createContact')
}

/** TODO(A04) */
export async function getContact(_ctx: RequestContext, _id: string): Promise<ContactDTO | null> {
  throw new Error('TODO(A04): getContact')
}

/** TODO(A04) */
export async function updateContact(_ctx: RequestContext, _id: string, _input: ContactInput): Promise<ContactDTO | null> {
  throw new Error('TODO(A04): updateContact')
}
