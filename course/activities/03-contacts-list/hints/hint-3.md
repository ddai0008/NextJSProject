# A03 · Hint 3 (close to code)

The reference solution is `npm run solution 3`. This is the part you are most likely to get stuck on; the rest follows.

**A cursor that keeps microseconds** (select the timestamp as text, use that text in the cursor, cast it back in the predicate):

```ts
const rows = await db
  .select({
    id: contacts.id, name: contacts.name, email: contacts.email, ownerId: contacts.ownerId, createdAt: contacts.createdAt,
    createdAtExact: sql<string>`${contacts.createdAt}::text`,
    companyName: companies.name,
  })
  .from(contacts)
  .leftJoin(companies, and(eq(companies.id, contacts.companyId), eq(companies.orgId, contacts.orgId)))
  .where(and(...conditions))
  .orderBy(desc(contacts.createdAt), desc(contacts.id))
  .limit(PAGE_SIZE + 1)

// the predicate for "after this row" when sorting newest first:
sql`(${contacts.createdAt}, ${contacts.id}) < (${cursor.t}::timestamptz, ${cursor.id}::uuid)`
```

**Escaping `LIKE`:**

```ts
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`)
const pattern = `%${escapeLike(term)}%`
```

**Indexes.** A plain ascending index can be read backwards, so it serves "newest first". A `desc()` column in a Drizzle index is
declared `DESC NULLS LAST`, but `ORDER BY created_at DESC` means `DESC NULLS FIRST`: an index with the other null order cannot give you the rows in the order you asked for,
and Postgres sorts instead. Either use ascending columns, or write `.desc().nullsFirst()`.

```ts
index('contacts_org_created_idx').on(t.orgId, t.createdAt, t.id),
index('contacts_org_name_idx').on(t.orgId, t.name, t.id),
index('contacts_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
index('contacts_email_trgm_idx').using('gin', sql`${t.email} gin_trgm_ops`),
```

and, as the **first line of the generated migration**, because the generator cannot write it:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
```

(Without it: `operator class "gin_trgm_ops" does not exist for access method "gin"`, SQLSTATE 42704. If the migration is not applied yet you can delete the
generated `.sql`, its `meta/<n>_snapshot.json`, and the last entry of `meta/_journal.json`, fix the schema and generate again.)

**The page skeleton:**

```tsx
export default function ContactsPage({ params, searchParams }: PageProps<'/[orgSlug]/contacts'>) {
  return (
    <main>
      <h1>Contacts</h1>
      <Suspense fallback={<div className="h-8" />}><SearchForm searchParams={searchParams} /></Suspense>
      <Table>
        <TableHeader>{/* Name, Email, … */}</TableHeader>
        <Suspense fallback={<RowsSkeleton />}><ContactRows params={params} searchParams={searchParams} /></Suspense>
      </Table>
    </main>
  )
}
```

Each of `SearchForm` and `ContactRows` is `async`, `await`s what it needs, and returns the markup. The skeleton rows must not carry `data-contact-id`.
