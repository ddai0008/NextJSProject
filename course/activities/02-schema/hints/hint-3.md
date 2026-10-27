# A02 · Hint 3 (close to code)

The shape of the answer for two tables; the rest follows the same patterns. `npm run solution 2` has all of it.

```ts
// companies.ts: make the pair (org_id, id) unique so other tables can reference a company TOGETHER with its organisation
export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    name: text('name').notNull(),
    domain: text('domain'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('companies_org_id_id_key').on(t.orgId, t.id)],
)

// contacts.ts (excerpt)
(t) => [
  foreignKey({ name: 'contacts_company_same_org', columns: [t.orgId, t.companyId], foreignColumns: [companies.orgId, companies.id] }),
  // ...the owner: a foreign key onto the pair (org_id, user_id) of `memberships`...
  uniqueIndex('contacts_org_email_key').on(t.orgId, sql`lower(${t.email})`).where(sql`${t.email} is not null`),
]
```

Other building blocks:

```ts
export const roleEnum = pgEnum('role', ['admin', 'manager', 'rep'])                       // memberships.role
primaryKey({ columns: [t.orgId, t.userId] })                                              // memberships
check('deals_value_not_negative', sql`${t.valueCents} >= 0`)                              // deals
bigint('value_cents', { mode: 'number' })                                                 // deals.value_cents
```

**The generated migration** puts the new `UNIQUE (org_id, id)` constraints on the *existing* tables `companies` and `contacts` **after** the
foreign keys that need them. Move the `ADD CONSTRAINT ... UNIQUE` statements above the first `FOREIGN KEY` statement (statements are separated
by `--> statement-breakpoint` lines), then `npm run db:migrate`. After it works, `npm run db:seed` to load data into the new tables.
