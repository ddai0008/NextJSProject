import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
