# A03 · Contacts at 10k rows

> **Phase 1 · Feature · Level L1 (guided) · about 5.5 h**
> Needs: A01 and A02 done. Run `npm run db:migrate` and `npm run db:seed` so your development database has the A02 schema and the full data.

## The ticket

**From:** Mei Tanaka, Product Manager
**Subject:** The contact list. Kestrel Solar goes live in two sprints.

> Kestrel has 30,000 contacts and their reps live in this list. In the beta with another tool they told us exactly what drove them mad:
>
> 1. "Searching takes forever, and page 400 takes longer than page 1."
> 2. "Paging sometimes shows the same person twice, or skips someone."
> 3. "I can't send a colleague a link to what I'm looking at, and the Back button throws away my search."
>
> What I need, per organisation (`/kestrel/contacts`, `/acme/contacts`, …):
> a table of contacts, **newest first** by default or **A to Z by name**, 25 per page, a search box that finds people by **name or
> email**, and URLs that mean something: if I copy the address bar and paste it to a colleague they see the same list, and Back
> goes back. The heading and the table header should be on screen at once; the contacts can arrive a moment later.
>
> Whatever you build has to be fast at Kestrel's size, and the person on page 400 must see exactly the people they should.

## What you will learn

- The App Router structure you will use all course: a **route group**, a **dynamic segment** (`[orgSlug]`), `layout`, `page`, `not-found`.
- Why `params` and `searchParams` are **Promises**, what "runtime data" means, and how Cache Components decides what goes into the
  **static shell** and what streams (the model most of this course builds on).
- Where each kind of mistake shows up: the editor, `tsc`, `next build`, the dev server, production, the browser.
- A data-access function that takes an explicit **request context**, and **pagination** that stays correct and fast.
- Reading a query plan, and which indexes a query needs.

## Before you start

- A01 and A02 done; Postgres running (`npm run db:up`).
- Open `lib/dal/contacts.ts` (the contract you must keep), `lib/dal/session.ts` (the stub that "trusts the URL"), and the layout
  `app/(app)/[orgSlug]/layout.tsx` (read how it handles `params`: it is the pattern for this activity).
- Read these (about 30 minutes) in your repo: `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`, sections **Streaming uncached data**,
  **Working with runtime APIs**, **Prerendering**, **Maximizing the static shell**.

## The mechanism

### What runs when

With Cache Components on (this project's setting), `next build` renders your routes once to produce a **static shell**: the HTML that can
be served immediately, before any request-specific work. Anything that needs the request, or reads uncached data, cannot be part of it.
Such work must either be **cached** (A04 and later), or sit **behind `<Suspense>`**: the shell then contains the fallback, and the real
content *streams* in when the request is handled. If neither, **the build fails**, because the framework refuses to silently make a
whole page wait.

| Needs | Examples | Where it can live |
| --- | --- | --- |
| nothing from the request | a heading, a table header, a skeleton | the static shell |
| the request ("runtime data") | `params`, `searchParams`, `cookies()`, `headers()` | behind `<Suspense>` |
| uncached I/O | a database query, a `fetch` | behind `<Suspense>` (or `use cache`) |

The structural rule that follows: **push the `await` down.** Awaiting `params` at the top of a page or layout holds back everything
under it. Pass the *Promise* down and await it in the smallest component that needs the value.

### `params` and `searchParams` are Promises

Since Next.js 15 they are Promises you `await` (or `use()`), and in 16 the old synchronous access is gone. The surprise is not that it
changed; it is **how it fails**. You will see in the experiment below.

### The tree for `/kestrel/contacts?q=smith`

```
app/layout.tsx                       root layout (html, body, fonts)
└─ app/(app)/[orgSlug]/layout.tsx    the organisation shell; (app) is a route group: a folder name that is NOT part of the URL
   └─ app/(app)/[orgSlug]/contacts/page.tsx    ← you write this
```

`[orgSlug]` makes the segment dynamic: `params` is `{ orgSlug: 'kestrel' }`. The query string arrives as `searchParams`.

### Reading rows from a database

A database does not "go to page 400"; it produces rows in order and **throws away** the ones you do not want. If you ask for rows
`OFFSET 10000 LIMIT 25`, it still has to walk 10,000 rows first, and if the order you asked for does not match an index it must sort them
all. Ask yourself what the cheapest question is that still means "the 25 people after the one I was looking at". And remember
that two rows can share the same value in the column you sort by.

The tool for seeing what Postgres will do is `EXPLAIN`. Learn to read four nodes: `Seq Scan` (reads the whole table), `Index Scan`
(walks an index, returning rows in index order), `Bitmap Heap Scan` (collects matches from an index, then reads them), `Sort`.
Try it in `npm run psql`:

```sql
explain select id, name from contacts
 where org_id = (select id from orgs where slug = 'kestrel')
 order by created_at desc, id desc limit 25;
```

### Search with `ILIKE`

`name ILIKE '%smith%'` is case-insensitive substring search, and `%` and `_` are *wildcards* inside the pattern. A search box holds
**text**, not a pattern, so what a user types must not be able to act as one.

## Do this first: three experiments (about 30 minutes)

You will make a mistake in these on purpose. The point is to learn how each one *fails*, because in real code it will not be
labelled. **Before you run anything**, create `docs/notes/a03-predictions.md` and write a table with your guess for each
cell (what happens: error? silent? what does the page show?):

| Variant | `next build` | `next dev` | `next start` (production) |
| --- | --- | --- | --- |
| E1 sync `params` | | | |
| E2 `await params` at the top of the page | | | |
| E3 `await searchParams` at the top of the page | | | |

Add a route `app/scratch/[slug]/page.tsx` and try each variant in turn:

```tsx
// E1: how you wrote it in Next.js 14
export default function Page({ params }: { params: { slug: string } }) {
  const { slug } = params
  return <h1>Post: {slug}</h1>
}

// E2
export default async function Page({ params }: PageProps<'/scratch/[slug]'>) {
  const { slug } = await params
  return <h1>Post: {slug}</h1>
}

// E3
export default async function Page({ searchParams }: PageProps<'/scratch/[slug]'>) {
  const { q } = await searchParams
  return <h1>Search: {q}</h1>
}
```

Run `npm run build` (then `npm run start` and open `/scratch/hello`) and `npm run dev` for each. Write what you actually saw next to
each guess. Then **delete `app/scratch`**. Compare your guesses with what happened; where they differ, write one sentence naming the
mechanism you had wrong. (That sentence is the point of the exercise.)

## Requirements

1. **The page** at `app/(app)/[orgSlug]/contacts/page.tsx`, replacing the stub:
   - an `<h1>` containing "Contacts";
   - a search form: a text input named `q` showing the current search, and a way to choose the order (`created` = newest first, the default;
     `name` = A to Z);
   - a `<table>` whose header cells (`<th>`) include **Name** and **Email**; one `<tr data-contact-id="<id>">` per contact, with the name in the
     first cell and the email in the second (add whatever else you like: company, date…);
   - a link with the text **Next** when there is another page; it must keep `q` and the order.
2. **URL as state.** `?q=…&sort=created|name&cursor=…` (the cursor is whatever your pagination needs; it is opaque to the page). Reloading,
   sharing and Back all work because the URL holds everything. Anything unexpected in the URL falls back to the defaults and never errors.
3. **The data function** `listContacts(ctx, query)` in `lib/dal/contacts.ts`: keep the signature and result type; 25 per page; scoped to `ctx.orgId`
   and nothing else; companies' names come with the rows without one extra query per row. Get the organisation and role with
   `requireRole(orgSlug, 'rep')` (a stub for now).
4. **Indexes**, in a new migration, so the list and the search stay inside the plan budget the tests check.
5. **The shell.** The heading and the table header are in the prerendered shell; the rows and the search box stream. Await `params`
   and `searchParams` only inside `<Suspense>` boundaries. The prerendered shell is a file you can open: `.next/server/app/[orgSlug]/contacts.html`.
6. **An unknown organisation** (`/no-such-org/contacts`) shows Next's not-found page and the response is marked `noindex`. (Read the
   box below for why the status is not 404.)
7. **The experiments** above, with `docs/notes/a03-predictions.md` filled in.

> **Why not a 404 status?** The check "does this organisation exist?" needs the request and the database, so it runs behind
> `<Suspense>`, *after* the shell has started streaming. By then the HTTP status line is already sent as 200. Next.js cannot take it back; it adds
> `<meta name="robots" content="noindex">` instead. A real 404 needs the check to happen before anything streams, which only a request-time
> hook like `proxy` can do (A06 gives you one). Read "Status codes" in `node_modules/next/dist/docs/01-app/02-guides/streaming.md`.

## Acceptance criteria

Run `npm run act -- 3` (it builds the app; add `--no-build` when you only changed a test or a doc).

| Test | What it checks |
| --- | --- |
| A03.1 | First page: 25 contacts, newest first, with the fields of `ContactDTO`. |
| A03.2 | Walking every page returns every contact once, in order (the smallest organisation). |
| A03.3 | Rows created within the same millisecond but different microseconds are neither lost nor repeated at a page boundary. |
| A03.4 | Sorting by name walks every contact once, A to Z. |
| A03.5 | Search matches name **or** email, ignoring case, across all pages. |
| A03.6 | `%` and `_` typed in the search are ordinary characters. |
| A03.7 | Every row of every result belongs to the organisation in the context, including when the cursor came from another organisation. |
| A03.8 | A bad cursor, an unknown sort, an empty or a huge search never throw: first page. |
| A03.9 | The plan budget: no `Sort` and no sequential scan of `contacts` for the list; no sequential scan and a **trigram** index for the search. |
| A03.10 | One page costs at most 2 queries. |
| A03.11 | `ctx.orgId` is a parameter of every contacts query. |
| A03.12 | The page shows the heading, the column headers, 25 rows, a **Next** link and a search box. |
| A03.13 | Following **Next** from the first page visits every contact once, in order. |
| A03.14 | `q` and `sort` in the URL filter and order the list, the box shows `q`, **Next** keeps both. |
| A03.15 | Bad parameters give the normal first page. |
| A03.16 | An unknown organisation shows the not-found page, marked `noindex`, with no contacts. |
| A03.17 | The prerendered shell holds the heading and the table headers and none of the contacts. |

## Messages you may meet

- Building a page that awaits at its top (experiments E2 and E3; the text is from this project):

  ```
  Error: Route "/scratch/[slug]": Next.js encountered uncached or runtime data during prerendering.

  `fetch(...)`, `cookies()`, `headers()`, `params`, `searchParams`, or `connection()` accessed outside of `<Suspense>` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

  Ways to fix this:
    - [stream] Provide a placeholder with `<Suspense fallback={...}>` around the data access
    - [cache] For uncached data (`fetch`, database calls): cache the access with `"use cache"` (does not apply to `connection()`)
    - [block] Set `export const instant = false` to allow a blocking route

  Learn more: https://nextjs.org/docs/messages/blocking-prerender-dynamic
  ```

  The message offers three ways out. For the contact rows, which one fits, which one cannot (what would a cache key have to contain?), and why is
  `[block]` the one this course avoids?
- Dev server, sync `params`: `Route "/scratch/[slug]" used `params.slug`. `params` is a Promise and must be unwrapped with `await` or `React.use()` ...`
- A plan test failing looks like `sequential scan of contacts (first page, newest first: Limit > Sort > Hash Join > Seq Scan on contacts > …)`.
  The text after the colon is the plan Postgres chose. Read it left to right: it tells you which node is the problem.

## Stretch goals

- Add `app/(app)/[orgSlug]/contacts/loading.tsx`. **Predict first:** does A03.17 still pass? Run it. Then explain it: what exactly does
  `loading.tsx` wrap, and in what situation would it have emptied your shell? (Try making the page itself `async` and awaiting `params` at its top to find out.)
- Show the total ("12 of 30,019") without hurting the page. Why is `count(*)` on a 30,000-row organisation a different kind of cost from the page query?
- Add `generateStaticParams` returning the four organisation slugs. What changes in the build output and in `contacts.html`?
- Make the search wait for the user (debounce) using a client component, without losing the URL as the source of truth.

## Self-review checklist

- [ ] My predictions file existed *before* I ran the experiments, and I wrote a sentence about each prediction that was wrong.
- [ ] I can say, for any component of my page, whether it is in the shell, behind a boundary, or would break the build, and why.
- [ ] I can explain why page 400 costs the same as page 1 in my implementation.
- [ ] I can explain why two rows with identical `created_at` cannot cause a skipped or repeated row.
- [ ] I know what happens when someone searches for `100%`.
- [ ] I can read the plan Postgres chose for each query, and say which index each one uses.
- [ ] Before the first run I wrote down how many of the 17 tests I expected to pass.

## Official docs

- Cache Components, the whole model: `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`
- `page` (params, searchParams): `.../03-api-reference/03-file-conventions/page.md` · dynamic routes: `.../dynamic-routes.md` · route groups: `.../route-groups.md`
- Streaming and status codes: `.../02-guides/streaming.md` · `notFound()`: `.../03-api-reference/04-functions/not-found.md` · `loading`: `.../loading.md`
- PostgreSQL: `EXPLAIN` <https://www.postgresql.org/docs/18/using-explain.html> · `LIMIT`/`OFFSET` <https://www.postgresql.org/docs/18/queries-limit.html> · index ordering <https://www.postgresql.org/docs/18/indexes-ordering.html>

## Stuck?

Hints are in [`hints/`](hints/): `hint-1.md` nudges, `hint-2.md` narrows, `hint-3.md` is close to code. Give each 15 minutes. `npm run solution 3`
prints the reference solution; read it **after** your own attempt.
