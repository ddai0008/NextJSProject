import 'server-only'
import type { RequestContext } from './types'

export type DealDTO = {
  id: string
  title: string
  valueCents: number
  stageId: string
  ownerId: string
  contactId: string | null
  companyId: string | null
  createdAt: string // ISO 8601
}

/**
 * TODO(A07): the deals the caller may see. A rep sees only the deals they own; managers and admins see every deal of the organisation. Never another organisation's. Newest first.
 */
export async function listDeals(_ctx: RequestContext): Promise<DealDTO[]> {
  throw new Error('TODO(A07): listDeals')
}

/**
 * TODO(A07): change a deal's title and/or value. A rep may change only their own deals (ForbiddenError otherwise); managers and admins any deal of the organisation.
 * null if there is no such deal in the organisation. A negative value is refused by the database (A02).
 */
export async function updateDeal(_ctx: RequestContext, _id: string, _changes: { title?: string; valueCents?: number }): Promise<DealDTO | null> {
  throw new Error('TODO(A07): updateDeal')
}
