import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
