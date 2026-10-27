# A08 · Hint 2 (narrows the approach)

**Delete, then let the compiler help.** The cleanest fix removes `lib/dal/legacy-contacts.ts`. TypeScript then names every caller. For each one, replace the unscoped call with the scoped function from `lib/dal/contacts.ts`, which needs the `ctx` that `requireRole` already returns (the callers were throwing it away).

**The page.** `getContact(ctx, contactId)` returns `null` for another organisation's id, for a malformed id and for an id that does not exist: all three should be `notFound()`. Note the shape differences: the legacy type had `company` and `phone`, the DTO has `companyName` and no phone.

**The endpoint.** Same replacement. For a missing contact return `Response.json({ error: … }, { status: 404 })`. While you are there, what does `requireRole` do for a visitor with no session when called from a Route Handler (it was written for pages)? A06 decided that APIs answer with status codes, not redirects. What does `getSession()` give you for that?

**The form.** The value that matters is the second one; the first is a tidy-up:

1. If you like, pass `orgSlug` and `contactId` to the action with `.bind(null, orgSlug, contactId)` instead of hidden inputs. Then view the page source (or `curl` it with your cookie) and look at what the form now contains: are the bound values hidden from whoever holds the form? What would that mean for how much you can rely on binding?
2. Make the action go through the DAL with the context: `requireRole`, then `getContact(ctx, id)` (not found → `notFound()`), then `updateContact(ctx, id, …)`. Read what `updateContact` does with `email` when you do not pass one. Read what it throws for a rep who is not the owner, and decide what the action should do with that. (`redirect()` throws: keep it outside any `try`.)

**The export.** It is the only Route Handler that queries the database itself, and A08.9 says why that is a smell: a query written in a handler has no context to filter by. Move the query into a DAL function that takes the `ctx`, and let `requireRole(slug, …)` produce the context. What does `requireRole` do for someone who is not in the organisation, and for an organisation that does not exist? Is that what the test wants?

**The class.** A08.6 wants every exported async DAL function to start with the context. A08.7 calls each id-taking function as a Kestrel **admin** with Acme's ids and compares Acme's rows before and after. If it names a function you did not touch, that function filters by `id` but not by `orgId`: it is the next incident, found early.

**One more look:** your note in `docs/notes/a08-incident.md` should now be able to say which of the three callers was *not* in the ticket, if any.
