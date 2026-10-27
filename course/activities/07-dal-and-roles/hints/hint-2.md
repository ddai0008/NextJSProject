# A07 · Hint 2 (narrows the approach)

**`requireRole`.** One query is enough: the organisation with the given slug, joined to *this person's* membership of it. No row means *either* there is no such organisation *or* they are not in it: both are `notFound()`, and you do not need to know which. Only then compare roles with `atLeast(row.role, minimum)`. The context you return carries the role **from that membership row**, not from anywhere else. Not signed in is `redirect('/login')` (exactly that path), and it happens before any query.

**"May I change this row?"** There are two shapes, and the tests do not choose for you:

- *Load, then check, then change:* read the row, compare `ownerId` with `ctx.userId` in code, then update.
- *Put the permission in the statement:* the `UPDATE`'s `WHERE` already says `org_id = ctx.orgId AND id = …`; for a rep add `AND owner_id = ctx.userId`. If no row changed, decide *why* with one more lookup: nothing in your organisation with that id → "not found"; something there → `ForbiddenError`.

Which one has a gap between "may I?" and "do it"? What can change in that gap? (Think of two requests at the same time. This is the same shape of mistake as A12 will show you at larger scale.) Whichever you pick, deals follow the same rule: a rep gets `owner_id = ctx.userId`, everyone with `atLeast(role, 'manager')` gets no extra condition.

**Lists are the same rule.** `listDeals` is "the organisation's deals" plus, for a rep, "that I own". Build the `WHERE` from conditions; do not fetch everything and filter in JavaScript.

**Malformed ids.** `where id = 'not-a-uuid'` makes Postgres raise `invalid input syntax for type uuid` (SQLSTATE `22P02`), which is not "not found". A04's `getContact` shows how the DAL avoids that.

**Reassign.** You do not need to check that the new owner is a member. The composite foreign key from A02 refuses it (`23503`) and the test wants *that* error exactly as the database raised it. If you catch it and replace it with your own, you hide the schema's answer from the caller; here we let it through.

**Members.** Select **columns by name** (`email`, `name`, `role`, `userId`), never a table. The join is `memberships` to `users`, restricted to `ctx.orgId`. For `changeRole`, "the last admin" is "this person is an admin and the organisation has exactly one admin": count before you change. (A race exists here; the stretch goal is about it. The tests do not ask for it.)

**The members page.** It is a Server Component under `app/(app)/[orgSlug]/members/`. `params` is a Promise and `requireRole` reads cookies, so the data-reading component sits inside `<Suspense>`. `redirect()` and `notFound()` work by throwing: if you wrap the call in `try/catch` for the forbidden case, catch **only** `ForbiddenError` and rethrow everything else (A04 taught this with `redirect`).

**The edit action.** It already catches the unique-violation. Add one more case before the generic "could not be saved": the refusal gets its own sentence that says who may do it.

**Boundary.** If A07.13 names a page that imports `@/db/...`, the query belongs in the DAL; if A07.12 names a client file, split it so that the part that needs data is a Server Component or an action.
