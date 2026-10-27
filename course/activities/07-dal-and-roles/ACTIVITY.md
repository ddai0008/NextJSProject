# A07 · Who is asking, and for which organisation?

> **Phase 1 · Feature · Level L2 (requirements and a given interface) · about 4 h**
> Needs: A06 done. Nothing new to install; the database schema does not change in this activity.

## The ticket

**From:** Dana Okafor, Head of Engineering
**Subject:** Reps, managers, admins: make the roles real

> Until now "signed in" has meant "may do anything". Kestrel Solar goes live with three kinds of people and they were promised three different experiences:
>
> - **Reps** work their own book: they create contacts, they edit the contacts **they own**, they see **their own deals**.
> - **Managers** run a team: they edit any contact of the organisation, delete or reassign contacts, see and change every deal.
> - **Admins** also manage **who is in the organisation and with which role**.
>
> One more fact from the pilot: our consultant, Casey, is a **rep at Kestrel and a manager at Acme**. She is one person with one login and two roles. If your design cannot say that, it is wrong.
>
> I do not want to review forty pages for "did you remember the role check?". I want the rules written **once**, in the layer that touches the data, so a page that forgets cannot leak. Pages and actions should only ask *"who is this, and in which organisation?"* and pass the answer down.
>
> Two details I care about. A person who asks for an organisation they do not belong to must get the same answer as for one that does not exist (we do not confirm customers to strangers). And whatever an admin sees about a member must never include anything secret.

## What you will learn

- **Authentication versus authorization**, and the third thing people forget: **membership**. "Who are you?" is A05; "are you in *this* organisation, and as what?" is this activity.
- A **data access layer (DAL)**: functions that take a **request context** first (`ctx`) and trust nothing else for identity. Why a function that accepts an `orgId` parameter is a function that can be called with the wrong one.
- Two kinds of "no": **not found** (you may not even know it exists) and **forbidden** (you are one of us, and you may not do this). When each is right, and what each leaks.
- **Where a rule lives.** Enforcing it in the query, in the function, in the page, or in the proxy are four different guarantees. You will measure the difference with tests that call each layer.
- **DTOs**: returning exactly the fields a caller needs, so that a secret cannot leak by `select *`.
- Making the organisation of the code **enforceable**: `server-only`, and a test that fails if a client component or a page reaches around the layer.

## Before you start

- A06 done and `npm run act:upto -- 6` green.
- Open and read, in this repo: `lib/dal/types.ts` (the vocabulary: `Role`, `atLeast`, `RequestContext`), `lib/dal/errors.ts` (what the DAL says when it refuses) and the four stubs `lib/dal/contact-admin.ts`, `deals.ts`, `members.ts` and `contacts.ts`. The names, parameters and result shapes are the contract the tests call.
- Skim `node_modules/next/dist/docs/01-app/02-guides/data-security.md` (*Data Access Layer*, *Passing data from server to client*, *Preventing client-side execution of server-only code*).

## The mechanism

### The request context, and the roles that belong to memberships

```
 request ──► requireRole('acme', 'manager') ──► { userId, orgId, orgSlug: 'acme', role: 'manager' } ──► DAL functions (ctx, ...args)
              │ no session            → /login
              │ not a member          → the not-found page   (same as "no such organisation")
              │ role below 'manager'  → ForbiddenError
```

- A role is a property of a **membership** (a person in an organisation), not of a person. `users` has no role column on purpose.
- `requireRole` is called **once per request**, at the edge (a page, an action), and the `ctx` it returns is handed to every DAL function. The DAL never looks at the URL, the form, or the cookie to decide who is acting.
- It signals with the framework's own tools: `redirect('/login')`, `notFound()`, and `throw new ForbiddenError()`. Keep exactly those, the tests (and A10) rely on them.

### Two layers will both refuse a rep. Why have both?

`requireRole(org, 'admin')` in the members page and `listMembers(ctx)` both say no to a rep. From outside you cannot tell which one did, and that is the point: **the DAL cannot assume that its caller checked**, and a page cannot assume the DAL is the only door. The tests call each layer on its own so that neither can quietly stop working.

### Not found versus forbidden

| Situation | Answer | Why |
| --- | --- | --- |
| A row of **another organisation** | `null` / `false` ("not found") | The caller must learn nothing about other tenants, not even that a row exists. |
| A row of **your organisation** that your role may not touch | `ForbiddenError` | You are inside; telling you "no, and here is why" is useful and leaks nothing. |
| An organisation you are **not a member of** | not-found page | Same answer as "no such organisation". |

### DTOs

A DAL function returns **the fields the caller needs**, as a plain object, not the database row. `select *` from `users` includes `password_hash`. A type that says `MemberDTO` has four fields is a promise; a test checks the keys of the object, not only the type.

### The boundary, as a build-time fact

`import 'server-only'` at the top of a module makes the *build* fail, with a message about that mistake, if a Client Component imports it (directly or through other modules). Try it once on a scratch branch: import a DAL function into `components/contact-form.tsx` and run `npm run build`; then remove the `server-only` lines from the chain and build again. Compare the two error messages. The second one comes only because the database driver needs Node's built-in modules; a server-side module that happens not to import any would be bundled for the browser without a word.
A test reads your import graph and enforces three rules; see the table below.

## Do this first (about 20 minutes)

Write `docs/notes/a07-matrix.md` **before** you write code:

1. A table with one row per operation (the eight DAL functions below, plus "open the members page") and a column per role (`rep`, `manager`, `admin`). In each cell: *yes*, *only if owner*, *forbidden*, or *n/a*.
2. For each operation: what does **someone from another organisation** get? Where in the code will the decision be made, and what is the *one* place a future operation must copy from?
3. Predict: Casey (rep at Kestrel, manager at Acme) opens `/kestrel/members` and `/acme/contacts`. What does each show? Then predict what the tests below call "the consultant acting as the REP she is in Kestrel".

## Requirements

All DAL functions take `ctx: RequestContext` first and work only inside `ctx.orgId`.

1. **`requireRole(orgSlug, minimum)`** in `lib/dal/session.ts`. Not signed in → `redirect('/login')`. The organisation does not exist, **or** the person is not a member of it → `notFound()`. A member whose role is below `minimum` → `throw new ForbiddenError()`. Otherwise the context, with the role **of that membership**.
2. **Contacts** (`lib/dal/contacts.ts`):
   - `createContact`: the new contact's owner is the caller.
   - `updateContact`: the **owner** may; **managers and admins** may change any contact of the organisation; anyone else of the organisation gets a `ForbiddenError`; a contact nobody owns can be changed only by a manager or an admin. Another organisation's contact (or a malformed id): `null`.
3. **Contact administration** (`lib/dal/contact-admin.ts`):
   - `deleteContact`: managers and admins only. `true` if deleted; `false` if there is no such contact in the organisation or the id is malformed.
   - `reassignContact`: managers and admins only. The new owner must be a member of **the organisation**; you do not need to check this in code, the database already refuses anyone else (A02), and that refusal must reach the caller untouched.
4. **Deals** (`lib/dal/deals.ts`):
   - `listDeals`: a rep sees only the deals they own; managers and admins see every deal of the organisation; nobody sees another organisation's. Newest first.
   - `updateDeal`: a rep may change only their own deals (`ForbiddenError` otherwise); managers and admins any deal of the organisation; `null` for another organisation's. A negative value is refused by the database.
5. **Members** (`lib/dal/members.ts`):
   - `listMembers`: admins only; only the caller's organisation; exactly the fields of `MemberDTO` and nothing else.
   - `changeRole`: admins only; `null` for someone who is not a member of this organisation. **The last admin of an organisation cannot be demoted** (`ForbiddenError`).
6. **Pages and actions.**
   - A new page `/[orgSlug]/members` that lists name, email and role for admins. For a manager or a rep it says (in words) that only admins can see members, and shows no member.
   - The contact edit form's action: a refused change (the rep is not the owner) must be explained **in words in the form's alert** and must not crash or write. (The edit page itself still opens for a contact you may see; the *action* decides.)
7. **The boundary.**
   - Every module of `lib/dal/` that reaches the database, cookies/headers or `lib/auth/` starts with `import 'server-only'`.
   - No Client Component (`'use client'`) imports from `lib/dal`, `lib/auth` or `db`.
   - No page, layout, action or component imports from `db`. They ask the DAL.
   - The seam from A05 still holds: only `lib/dal/`, `lib/auth/` and `app/api/auth/` import from `lib/auth/`.

## Acceptance criteria

Run `npm run act -- 7`; it needs the browser (A07.15) and builds your app. Run `npm run act:upto -- 7` at the end.

| Test | What it checks |
| --- | --- |
| A07.1 | Changing a contact: owner, manager, admin yes; another rep forbidden; another organisation not found; the consultant as a rep in Kestrel vs a manager in Acme; contacts nobody owns. |
| A07.2 | Deleting: managers and admins only; another organisation cannot; a second delete and a malformed id answer `false`. |
| A07.3 | A contact you create is owned by you. |
| A07.4 | Reassigning: managers and admins only; another organisation cannot; a non-member as the new owner fails with the **database's** foreign-key error (`23503`). |
| A07.5 | Deals visible to a rep, a manager, an admin, another organisation and the consultant in each of her two roles. |
| A07.6 | Changing a deal: own / not own / any as manager / another organisation / a negative value (`23514`). |
| A07.7 | Listing members: admins only, only their organisation, exactly `userId`, `email`, `name`, `role`, no password hash. |
| A07.8 | Changing a role: admins only; another organisation's user is not found; the last admin stays (in an organisation of its own). |
| A07.9 | A member sees their organisation's contacts; a member of another organisation gets the not-found page and none of the data, from three different URLs. |
| A07.10 | The members page: an admin sees the members; a manager, a rep and another organisation's admin see none; a visitor with no cookie is redirected. |
| A07.11 | Each module of `lib/dal` that reaches the database, headers or auth internals imports `server-only`. |
| A07.12 | No Client Component imports the DAL, the database or auth internals. |
| A07.13 | No page, layout, action or component imports the database. |
| A07.14 | Only `lib/dal`, `lib/auth` and the auth endpoints import from `lib/auth`; `requireRole` still lives in `lib/dal/session.ts`. |
| A07.15 | In the browser: a rep who edits someone else's contact is told no, in words, nothing is written; their own contact saves. |
| A07.16 | `requireRole` called directly: no or forged session → `/login`; not a member or no such organisation → not found; role below the minimum → forbidden; otherwise the context. |
| A07.17 | The same person gets different contexts in two organisations (rep in one, manager in the other). |

## Messages you may meet

- `expected 'ok' to be 'forbidden'` (with the name of a role and an operation): the check for that cell of the matrix is missing. `expected 'forbidden' to be 'not found'`: you refused a stranger *loudly*; a stranger should learn nothing.
- `threw Error: TODO(A07): …`: that function is still the stub.
- `the refusal is the database's (foreign key): expected '…' to be '23503'`: you turned the database's error into your own, or you checked in code and never let the foreign key speak.
- `columns … 'passwordHash'` or `a MemberDTO has these fields and no others`: your query returned more than the DTO says.
- `modules that reach the database or cookies without \`import "server-only"\``: add it; `A07.12 … imports …`: a `'use client'` file reaches the DAL, go through a Server Component or an action instead.
- At **build** time, `'server-only' cannot be imported from a Client Component module` (the first error of the same build says `…but you are using it in the Pages Router`; ignore that wording and read the *Client Component Browser* import trace, which names your file): the real wall. A07.12 reports the same mistake without a build.
- `expected { threw: 'forbidden' } …` in A07.16: that line says what `requireRole` did and what it should have done. `REDIRECT /login`, `NOT_FOUND` and `forbidden` are the three signals; any other string is what your code threw instead.

## Stretch goals

- The "last admin" rule is a **race**: two admins demote each other at the same instant, each sees "there is another admin", and the organisation ends up with none. Write the two-request test that fails with a naive implementation, then close it (what does a row lock buy, and what would a deferred constraint buy?). A12 revisits concurrent updates.
- Add `listDeals` to a page and give managers a "team" filter. Where does the filter live: in the query, or after it?
- Replace the three `ForbiddenError`/`null` patterns with a small policy module (`can(ctx, 'contact:update', row)`). What do you gain, what is hidden? Which of today's tests would catch a policy that is too permissive?
- Think about the **transition**: a member is demoted while holding a session. Does their next request see the new role? (Where is the role read: at login, or on every request? Check `requireRole`.)

## Self-review checklist

- [ ] No DAL function takes an organisation id or a user id as a parameter to decide *who is acting*. (Parameters that name an object are fine: a contact id, a new owner.)
- [ ] For each of the eight operations I can say whether it filters in the `WHERE` or checks in code, and what happens between "may I?" and "do it" in each case.
- [ ] I know why another organisation's contact answers "not found" but another rep's contact answers "forbidden".
- [ ] A `select *` anywhere near `users` would leak; mine selects columns by name.
- [ ] Deleting the role check from `requireRole` does not make the members page leak (the DAL still refuses) but it does fail a test. I can explain both halves of that sentence.
- [ ] I did not catch `redirect()`/`notFound()` errors in the members page: only `ForbiddenError`.
- [ ] I wrote `docs/notes/a07-matrix.md` first and compared it with what the tests demanded.

## Official docs

- Next.js (in your repo): `01-app/02-guides/data-security.md`; `01-app/03-api-reference/04-functions/not-found.md`, `redirect.md`; `01-app/02-guides/authentication.md` (*Authorization*)
- OWASP: Authorization Cheat Sheet <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>; Insecure Direct Object Reference Prevention <https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html>
- PostgreSQL: `SELECT … FOR UPDATE` <https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE> (for the stretch goal)

## Stuck?

Hints are in [`hints/`](hints/). `npm run solution 7` prints the reference solution; read it **after** your own attempt.
