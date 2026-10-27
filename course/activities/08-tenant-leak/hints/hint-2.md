# A08 · Hint 2 (narrows the approach)

**Delete, then let the compiler help.** The cleanest fix removes `lib/dal/legacy-contacts.ts`. TypeScript then names every caller. For each one, replace the unscoped call with the scoped function from `lib/dal/contacts.ts`, which needs the `ctx` that `requireRole` already returns (the callers were throwing it away).

**The page.** `getContact(ctx, contactId)` returns `null` for another organisation's id, for a malformed id and for an id that does not exist: all three should be `notFound()`. Note the shape differences: the legacy type had `company` and `phone`, the DTO has `companyName` and no phone.

**The endpoint.** Same replacement. For a missing contact return `Response.json({ error: … }, { status: 404 })`. While you are there, what does `requireRole` do for a visitor with no session when called from a Route Handler (it was written for pages)? A06 decided that APIs answer with status codes, not redirects. What does `getSession()` give you for that?

**The form.** Two independent improvements, and the second is the one that matters:

1. Take `orgSlug` and `contactId` out of the form: pass them to the action with `.bind(null, orgSlug, contactId)` when the page renders. What can no longer be forged?
2. Make the action go through the DAL with the context: `requireRole`, then `getContact(ctx, id)` (not found → `notFound()`), then `updateContact(ctx, id, …)`. Read what `updateContact` does with `email` when you do not pass one. Read what it throws for a rep who is not the owner, and decide what the action should do with that. (`redirect()` throws: keep it outside any `try`.)

**The class.** A08.6 wants every exported async DAL function to start with the context. A08.7 calls each id-taking function as a Kestrel **admin** with Acme's ids and compares Acme's rows before and after. If it names a function you did not touch, that function filters by `id` but not by `orgId`: it is the next incident, found early.

**One more look:** your note in `docs/notes/a08-incident.md` should now be able to say which of the three callers was *not* in the ticket, if any.
