# A03 · Hint 2 (narrows the approach)

**Seek, don't skip.** Instead of `OFFSET`, return the rows that come *after* the last row you showed, in the same order. The cursor holds
the sort columns of the last row you returned. Compare as a **row value**: `(created_at, id) < ($1, $2)` for newest-first, and the
id is there to break ties. Ask for one row more than you show (26, show 25): if you got 26 there is a next page, and you needed no `count(*)`.
Validate the cursor like any input from outside (it comes back in the URL): if it does not parse, ignore it and serve the first page.

**Microseconds.** Postgres keeps microseconds in a `timestamptz`; a JavaScript `Date` keeps milliseconds. If the cursor's timestamp passes
through a `Date`, rows that differ only below the millisecond can be skipped or repeated at a page boundary (that is test A03.3).
Is there a way to read the timestamp out of the database *as it is*, with all its digits, and give it straight back?

**The `LIKE` characters.** `%` and `_` are wildcards and the backslash escapes them in `LIKE`/`ILIKE` patterns. Escape what the user typed *before*
you put `%…%` around it. Also cap the length of a search.

**Indexes.** Three different needs:
1. newest first within an organisation, 2. A to Z within an organisation, 3. substring search in name and in email.
For 1 and 2, think about what columns the index must have and in what order, and read about **index ordering** in the docs (ascending/descending,
and where NULLs go). For 3, a plain btree cannot serve `ILIKE '%text%'`; Postgres ships an extension for substring and similarity matching on
text, based on **trigrams**. It provides index operator classes for a GIN (or GiST) index.

**Migrations.** Drizzle generates `CREATE INDEX` for your schema, but it cannot create extensions: that line is yours to add to the migration SQL, and it must come
before the index that needs it. Read what the generator wrote before you apply it.

**Where the boundaries go.** `ContactsPage` stays a synchronous function that returns `<h1>`, the table header, and two components, each behind its own
`<Suspense>`: the search form (awaits `searchParams`) and the rows (awaits `params`, `searchParams`, calls `requireRole` and `listContacts`).
Pass the *Promises* down as props; `await` inside.

**Rows and the Next link.** `data-contact-id` goes on each `<tr>`. The "Next" link's `href` is built from the current `q`, `sort` and the new cursor, and it goes inside
the same streamed component as the rows (so that you query the database only once per request).
