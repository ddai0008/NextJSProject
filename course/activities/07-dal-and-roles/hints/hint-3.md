# A07 · Hint 3 (close to code)

The reference solution is `npm run solution 7`. The pieces, as outlines:

**`requireRole` (`lib/dal/session.ts`):**

```ts
export async function requireRole(orgSlug: string, minimum: Role): Promise<RequestContext> {
  const session = await getSession()
  if (!session) redirect('/login')
  const [row] = await db
    .select({ orgId: orgs.id, role: memberships.role })
    .from(orgs)
    .innerJoin(memberships, /* same org AND this user */)
    .where(eq(orgs.slug, orgSlug))
    .limit(1)
  if (!row) notFound()
  if (!atLeast(row.role, minimum)) throw new ForbiddenError()
  return { userId: session.userId, orgId: row.orgId, orgSlug, role: row.role }
}
```

**A permission as a piece of `WHERE` (contacts and deals):**

```ts
const mine = atLeast(ctx.role, 'manager') ? [] : [eq(contacts.ownerId, ctx.userId)]
const updated = await db
  .update(contacts)
  .set({ /* the fields */ })
  .where(and(eq(contacts.orgId, ctx.orgId), eq(contacts.id, id), ...mine))
  .returning({ id: contacts.id })
if (updated.length > 0) return /* the DTO, read back through your existing getContact */
// nothing changed: why? a second lookup inside the organisation tells "not here" (null) from "not yours" (ForbiddenError)
```

**A role check used by several functions:**

```ts
function requireManager(ctx: RequestContext) {
  if (!atLeast(ctx.role, 'manager')) throw new ForbiddenError('Only managers and admins can do this.')
}
```

Call it on the first line of `deleteContact` and `reassignContact`; call a similar `requireAdmin` in the two member functions. The check happens **before** any query, so a refused caller costs the database nothing and learns nothing.

**`listMembers`:**

```ts
db.select({ userId: users.id, email: users.email, name: users.name, role: memberships.role })
  .from(memberships)
  .innerJoin(users, eq(users.id, memberships.userId))
  .where(eq(memberships.orgId, ctx.orgId))
```

**`changeRole`, the rule in words:** if the new role is not `admin`, and the person being changed is currently an admin, and they are the only admin of the organisation, refuse with a `ForbiddenError`. Only then update (`WHERE org_id = ctx.orgId AND user_id = …`; zero rows changed means "not a member": `null`).

**Members page, shape:**

```tsx
export default function MembersPage({ params }: PageProps<'/[orgSlug]/members'>) {
  return <main>… <Suspense fallback={…}><MemberList params={params} /></Suspense></main>
}
async function MemberList({ params }) {
  const { orgSlug } = await params
  let members
  try {
    const ctx = await requireRole(orgSlug, 'admin')
    members = await listMembers(ctx)
  } catch (error) {
    if (error instanceof ForbiddenError) return <p>Only admins can see the members of an organisation.</p>
    throw error   // redirect() and notFound() are errors too
  }
  return /* a table of name, email, role */
}
```

After this, `npm run act:upto -- 7` should be green, including A03 to A06.
