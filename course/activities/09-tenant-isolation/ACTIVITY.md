# A09 · Post-incident: how do we isolate tenants for good?

> **Phase 1 · Design review · Level L4 (a business ticket and acceptance tests; an ADR is required) · about 4 h**
> Needs: A08 done and `npm run act:upto -- 8` green. This is the last activity of Phase 1. **Write the decision record before you write any code.**

## The ticket

**From:** Jun Park, CTO
**Subject:** The board's question after the Kestrel/Acme report

> The board asked one question, and I could not answer it: **"If an engineer forgets a filter tomorrow, what stops the leak?"** Today the honest answer is "nothing". We fixed four paths and wrote tests that look for the *kind* of mistake, but a test only catches mistakes somebody imagined.
>
> Acme's security contact wants our written position on tenant isolation, and our insurer asks whether tenants are separated by the database or only by our code. I want an answer that does not depend on who wrote the query.
>
> Constraints: we release weekly, so no big-bang rewrite; our customers are mostly small but a few have tens of thousands of contacts; people can belong to more than one organisation (Casey, our consultant, is in two); and the contact search must stay fast. Decide, write it down so the next engineer can disagree with the reasoning rather than the conclusion, then build the wall.

## What you will learn

- The main **ways to isolate tenants** (filters in code, row-level security on shared tables, a schema per tenant, a database per tenant) and, more importantly, **how each one fails** and what it costs to run.
- Writing an **ADR** (architecture decision record): context, real alternatives, a decision that follows from the forces, and honest consequences.
- Postgres **roles and row-level security**: who is exempt from a policy (owners, superusers, `BYPASSRLS`), why "no context" must mean "no rows" (**fail closed**), and what a policy does to a query plan.
- The **pooling trap**: anything stateful on a database connection is shared by the next request that borrows it.
- **Error side channels**: a database error is an answer. If it can depend on another tenant's data, a stranger can read that data one yes-or-no question at a time.
- **Defence in depth** as something you can measure: which of your earlier tests go blind once a second wall exists, and why that is the point.

## Before you start

- A08 done. Your development database needs the A08 schema: `npm run db:migrate`.
- Read, in this order and with the incident in mind: the PostgreSQL manual chapter *Row Security Policies* (`ddl-rowsecurity`), then the pages for `CREATE POLICY`, `CREATE ROLE`, the `set_config` function (*Configuration Settings Functions*) and the `LEAKPROOF` paragraph of `CREATE FUNCTION`. The manual for your server version is at <https://www.postgresql.org/docs/18/>.
- Skim `lib/dal/contacts.ts` and `db/client.ts`: the DAL is where every query goes through, and `db/client.ts` is the one place that owns the connection pool.

## Do this first (about 60 minutes, no code)

Create `docs/adr/0001-tenant-isolation.md` and write, **before** reading about any particular mechanism in depth:

1. **Context** (at least 60 words): what happened, what forces the choice (use the ticket: how many tenants, how large, who belongs to several, the pool, the search, the team).
2. **Options**: at least three, one `### <name>` heading each, with a short description of how it works and a line that says **how it fails** (a sentence that contains "failure mode", "how it fails", "fails when" or "breaks when"). Do not make straw men: write each option as its advocate would.
3. Leave **Decision** and **Consequences** for after the experiments below, but reserve the headings.

Then run these experiments with `npm run psql` and **predict first**, in the ADR's margin or a note:

- In a scratch table, `ENABLE ROW LEVEL SECURITY` and create a policy. Who sees which rows: the table's owner? a superuser? a plain role you create and `GRANT SELECT` to? Which of them did the incident-era app connect as?
- `SELECT set_config('app.org_id', 'x', false);` in one session, then check `current_setting('app.org_id', true)` in the same session after `COMMIT`; repeat with `true` as the last argument inside a transaction. What does the next request on a pooled connection see in each case?
- Read `current_setting('app.org_id', true)` in a session where it was never set, and in one where it was set locally and the transaction has ended. Are the answers the same?

## The mechanism

```
 request ──► requireRole ──► ctx ──► DAL function ──► [ your second wall ] ──► Postgres
                                          │                    │
                                  WHERE org_id = ctx.orgId     the database refuses rows of any other tenant,
                                  (the first wall)             whether or not the query above remembered to filter
```

Two walls only help if they fail *independently*. The first wall (the `WHERE`) is written by each author. The second must not be: it lives in the database, under a role the application cannot widen, and it must **fail closed**: when nobody has said which tenant this request is for, the answer is "no rows", not "all rows".
Whatever you choose, three questions decide whether it works, and the tests ask all three:

1. **Who is the application, to the database?** A role that is a superuser, or owns the tables, or has `BYPASSRLS` is exempt from any row-level policy. The runner connects the app as a role named `crm_app` as soon as it exists, and everything else (migrations, the seed, the test helpers) stays on the owner role. The test asks the database which roles the *running* app is connected as, not only which role is in a URL.
2. **How does the database learn the tenant of this request, and when does it forget?** If the answer is a setting on the connection, then "when" is the whole problem: the pool hands the same connection to the next request.
3. **What did the wall do to your queries?** A policy is an extra condition on every statement, and Postgres is careful about what it will evaluate before that condition: it will not run a function on a row ahead of the policy unless the function is known to reveal nothing about its arguments (`LEAKPROOF`). You measured a query-plan budget in A03; it is still yours, and what it costs under your wall is a number for the ADR, not a guess.

## Requirements

1. **The decision record.** `docs/adr/0001-<short-title>.md` with `## Context`, `## Options` (at least three `###` options, each with how it fails), `## Decision` (names the option you chose, using its heading text) and `## Consequences` (what gets easier, what gets harder, **what is still not protected**).
2. **Restricted credentials.** A migration creates a role named `crm_app` (login; the password in development is `crm_app`) that can read and write rows but is not a superuser, cannot bypass row-level security, and does not own the tenant tables. `DATABASE_URL` for the running app is that role (the runner does this for you once the role exists); migrations and the seed still use the owner.
3. **The wall.** With the application's credentials and **no tenant context**, the tenant tables (`contacts`, `companies`, `deals`, `stages`) return no rows (or the statement fails), and writes fail. This must hold for the strategy you chose, not only for one mechanism.
4. **The access layer names the tenant.** Every access to a tenant table in the DAL establishes which tenant the request is for. After a request, **even one that failed**, nothing of that tenant is left on the connection: a statement with no context on the same pooled connection sees nothing. Alternating requests for two organisations on a single connection never see each other's rows.
5. **The plan budget.** The contact list and the search never read the whole table: they use an index (and the list needs no sort), measured **as the application's user, with the context in place**. Whether the search can still use the trigram indexes under your wall is part of your design: say in the ADR what you chose, what you **measured**, and at what number of contacts in one tenant your choice stops being good enough.
6. **No side channel through errors.** A search pattern that makes the database raise an error (a lone backslash at the end, for example) gets the same answer whether or not *another* tenant has rows that match it.
7. **Nothing else regresses.** A01 to A08 pass unchanged; their DAL tests now run as the restricted role.

## Acceptance criteria

Run `npm run act -- 9`, then `npm run act:upto -- 9`.

| Test | What it checks |
| --- | --- |
| A09.1 | `docs/adr/0001-….md`: Context, at least three Options each with how it fails, a Decision that names one of them, Consequences. (The *shape* of the record; whether the reasoning is good is yours to judge with the checklist below.) |
| A09.2 | The app's database user is not a superuser, cannot bypass row-level security, and does not own the tenant tables; and the connections the **running app** holds are made by such a user. |
| A09.3 | With the app's credentials and no context: no rows from any tenant table (or an error), no insert, update or delete. |
| A09.4 | With a pool of one connection: after a request for one organisation, with no context the app sees nothing; the same after a failed request; 24 interleaved requests for two organisations each see only their own. |
| A09.5 | The list (newest first, A to Z) and the search use an index and never scan the whole table, the list with no sort. Planned as the app's user after replaying what the DAL did on its connection, with planner statistics present. |
| A09.6 | A malformed search pattern (a lone trailing backslash) answers the same for a word only *another* tenant has as for a word nobody has. Sent to the database as the app's user, after replaying what the DAL did to name the tenant. |

## Messages you may meet

- `docs/adr/0001-<short-title>.md is missing`; `Option "…": add a line saying how it fails`; `Decision: name the option you chose, using its heading text`: A09.1 tells you what shape is missing.
- `the runner connects the app as crm_app when that role exists: create it in a migration`: the app still connects as the owner. `the app's database user "crm_app": { superuser: true … }`: the role is too powerful.
- `select * from contacts as the app, no context: {"rows":N}`: there is no wall yet, or the policy lets everything through.
- `after a request for Acme, a statement with no context on the same connection: {"rows":N}`: the tenant was left on the connection.
- `timeout exceeded when trying to connect`: you asked the pool for a second connection while you were holding the only one (a transaction inside a transaction).
- Many earlier DAL tests returning empty results: some DAL function reads a tenant table outside the wrapper that names the tenant.
- `new row violates row-level security policy for table "…"` (SQLSTATE `42501`): you wrote a row for a tenant other than the one you named. `permission denied for table …` (also `42501`): the role lacks a `GRANT`.
- `sequential scan of contacts (…)` or `an index is used on contacts (…)`: the list or the search reads the whole table. Run the statement with `EXPLAIN` **as the app's role**, with the tenant set, and compare it with the plan you get as the owner.
- `a Kestrel member probing for a word that only Acme has, versus one that nobody has: expected { error: '22025' } to deeply equal { rows: 0 }` (or the reverse): the database evaluated the search on another tenant's rows **before** it applied the isolation rule, and the difference between "error" and "no rows" tells a stranger whether any tenant has that word.

## Stretch goals

- **A test for the future.** Write a test that lists every table with an `org_id` column and requires a policy (or whatever your strategy uses) on each of them. Which of your four tables would it have caught missing?
- **`FORCE ROW LEVEL SECURITY`.** What does it change for the owner, and why would you not use it on a table whose owner also runs your migrations?
- **Cost.** Count the statements one DAL call now sends. Which of them could be merged without weakening the wall?
- **Is `LEAKPROOF` safe?** Predict first. Then, in a scratch database as a superuser, run `ALTER FUNCTION texticlike(text, text) LEAKPROOF`, look at the search plan as the app's user, and send the probe of A09.6 by hand (a pattern ending in a lone backslash, for a word that exists only in another tenant). What does the plan look like, and what does the probe return? What does that say about "our code escapes its search terms" as a defence for a second wall?
- **Where does the trigram index become necessary?** Load one tenant with N contacts for growing N, time the search for a term that matches nothing (the worst case: the whole tenant is read), and find the N where it crosses 100 ms on your machine. Put the number, and the machine, in your ADR.
- **Which tests went blind?** Take the first wall away in one function (delete the `org_id` filter) and run the earlier tests. Which ones still fail, and which now pass? What does that say about what each was testing? Then run them again with `ACT_APP_AS_OWNER=1 npm run act -- 8` (the app connects as the owner, which row-level security does not apply to) and compare. Why do you want *both* configurations in CI?
- **Backups and restores.** For each option in your ADR: what does restoring *one* tenant's data to yesterday involve?

## Self-review checklist (judge your own ADR)

- [ ] Each option is one a team would genuinely choose, described the way its advocate would.
- [ ] Each failure mode is specific ("fails when…"), not a label, and I could write a test for it.
- [ ] The decision follows from the forces in the Context; I can point at the sentence that rules out each rejected option.
- [ ] The consequences include something that gets *harder*, and something that is **still not protected**.
- [ ] I can say what would make me revisit this decision.
- [ ] Every claim about Postgres in the ADR is one I measured or one I read in the manual (and said so). In particular, any claim that a function is "safe" to treat specially has a probe behind it, not an argument.
- [ ] Before the first run I wrote down how many of the 5 tests I expected to pass.

## Official docs

- PostgreSQL: *Row Security Policies* <https://www.postgresql.org/docs/18/ddl-rowsecurity.html>; `CREATE POLICY` <https://www.postgresql.org/docs/18/sql-createpolicy.html>; `CREATE ROLE` <https://www.postgresql.org/docs/18/sql-createrole.html>; configuration settings functions (`set_config`) <https://www.postgresql.org/docs/18/functions-admin.html>; `CREATE FUNCTION` (`LEAKPROOF`) <https://www.postgresql.org/docs/18/sql-createfunction.html>
- ADRs: Michael Nygard, *Documenting Architecture Decisions* <https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions>
- Drizzle: custom SQL migrations (`drizzle-kit generate --custom`) <https://orm.drizzle.team/docs/kit-custom-migrations>

## Stuck?

Hints are in [`hints/`](hints/). `npm run solution 9` prints the reference solution (including a model ADR); read it **after** your own attempt.
