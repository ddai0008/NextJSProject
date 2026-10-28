# A09 · Hint 3 (close to code)

The reference solution, including a model ADR, is `npm run solution 9`. The pieces, as outlines:

**The migration (`db/migrations/0004_….sql`, after `drizzle-kit generate --custom`):**

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_app') THEN
    CREATE ROLE crm_app LOGIN PASSWORD 'crm_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;--> statement-breakpoint
ALTER ROLE crm_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crm_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_app;--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "contacts" USING ("org_id" = /* the setting, as a uuid; think about NULL and '' */);--> statement-breakpoint
/* … the same for companies, deals and stages … */
/* … memberships needs separate rules for reading (the tenant's members, and a person's own memberships) and for writing (only inside the tenant) … */
/* … nothing else is needed for the list. What the search needs, if anything, is a decision for your ADR, backed by a measurement … */
```

**A `withPerson` beside it** (only if your design for `memberships` needs the person): the same shape as `withTenant`, setting a second transaction-local setting, used by `requireRole` and by nothing else.

**`withTenant` in `db/client.ts`:**

```ts
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export function withTenant<T>(ctx: { orgId: string }, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${ctx.orgId}, /* session or transaction? */)`)
    return fn(tx)
  })
}
```

**A DAL function with it (before → after):**

```ts
// before
const [row] = await db.select(columns).from(contacts).where(and(eq(contacts.orgId, ctx.orgId), eq(contacts.id, id))).limit(1)
// after
const [row] = await withTenant(ctx, (tx) => tx.select(columns).from(contacts).where(and(eq(contacts.orgId, ctx.orgId), eq(contacts.id, id))).limit(1))
```

The `WHERE org_id = …` stays: it is the first wall. Functions that read the answer back after writing do so in a second call (`return getContact(ctx, id)`), never inside the first.

**Skeleton of the ADR (the headings the test looks for):**

```md
# ADR 0001: …
## Context
## Options
### <option 1>
… how it works …
Failure mode: it fails when …
### <option 2>
### <option 3>
## Decision
We choose <option, using its heading text> because …
## Consequences
- what gets easier
- what gets harder (measure something, or say you did not)
- what is still not protected
```
