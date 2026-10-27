# A03 · Hint 1 (a nudge)

**Start from the data, not the page.** Tests A03.1 to A03.11 call `listContacts` directly. Get those right first; the page is
a thin layer on top, and the page tests (A03.12 to A03.17) are the last ones.

**For each part of the page, ask one question: does it need the request?** The heading does not. The table header does not. The search
box needs `searchParams` (to show what was searched). The rows need `params`, `searchParams` *and* the database. Draw your page as a tree and
colour the nodes "static" and "needs the request". Where would the `<Suspense>` boundaries go so that the static nodes are not trapped inside one?

**Pagination.** Take the case "the person on page 400". What is the cheapest thing you could remember about the *previous* page that
lets the database start right there instead of counting from the top? Which column(s) uniquely identify a row's position in the
order? (Two contacts can have the same `created_at`.)

**Search.** What do you want to happen if someone types `50%`? And what does Postgres do with `%` inside an `ILIKE` pattern?

**Reading failures.** A plan test prints the plan Postgres chose. Find the first node that does not belong there (a `Sort`, a
`Seq Scan`) and ask which index would let Postgres avoid it, and in which *direction* that index is read.

**Before you run anything:** write down how many tests you expect to pass.
