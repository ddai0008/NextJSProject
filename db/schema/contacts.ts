import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  orgId: uuid('org_id').notNull(),
  companyId: uuid('company_id'),
  name: text('name').notNull(),
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
