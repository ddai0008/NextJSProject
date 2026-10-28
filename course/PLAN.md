# Pipewise CRM course: plan

**Status (2026-10-27):** Phase 1 (A01-A09) is **generated and waiting for your review**: activities, hints, acceptance tests and a verified reference
implementation. Phases 2-4 are still an **outline only**: each is generated after you finish the previous one, recalibrated from `PROGRESS.md`, and may change.

Versions were checked on 2026-10-26 against the npm registry, Maven Central, start.spring.io, endoflife.date, Docker Hub, the docs
bundled in `node_modules/next/dist/docs` (they match the installed 16.4.3) and the vendors' docs.

## Decisions so far

| # | Decision | Applied how |
| --- | --- | --- |
| 1 | Approve Phase 1; Phases 2-4 outline only; regenerate each phase after the previous one, from `PROGRESS.md`; re-estimate Phase 3 for your Java level | Section 2 (Phase 1 in full), section 3 (outline); Phase 3 re-estimated in section 3 |
| 2 | Java: beginner. Time: 14 h/week first stated; **5 weekdays x 3 h = 15 h/week, and a phase should fit in 2 or 3 weeks (30-45 h)** (restated 2026-10-28) | Java primer + more guidance in Phase 3; totals in section 1 |
| 3 | Docker works in WSL; use `docker exec` for `psql` | Verified (spike S1); A01 will ship an `npm run psql` wrapper around `docker compose exec` |
| 4 | Solutions on `reference` only, hints stay on `main`; a script prints a solution without switching branches | `npm run solution 05` (PR #5) |
| 5 | Node 24 from one version file; JDK 25 deferred to Phase 3 | `.nvmrc` read by CI and by `scripts/use-node.sh` (PR #5) |
| 6 | Baseline PR; CI fix and CLAUDE.md cleanup as separate commits | The baseline and the typegen CI fix were **already on `main`** (PR #4); only the CLAUDE.md cleanup was left. See PR #5 |
| 7 | You answer `DIAGNOSTIC.md` before Phase 1 is generated | Answered 2026-10-27; A01, A03 and A04 were lengthened from it (`PROGRESS.md`) |
| 8 | ORM ADR rewritten; RC `latest` tag is a reason to pin, not to switch | ADR-002 |
| 9 | Phase 1 auth sits behind your own `getSession()` / `requireRole()` seam so A10 reimplements the seam | Phase 1 acceptance criteria, A05-A07, and A10 |
| 10 | Spike each open risk on `reference` before generating any phase and report | Section 5; Phase 1 spikes are done |
| 11 | CSP nonces vs the static shell becomes a design-review activity | A34 is now a **D** |
| 12 | Pin `@dnd-kit` to an exact version | ADR-006 |

---

## 1. The shape of the course

You are an engineer at **Pipewise**, a B2B CRM vendor. Tickets come from customer orgs (Kestrel Solar, Acme Freight, Lumen Dental,
Harbor & Finch LLP) and from internal people (Head of Sales, Support, Security). Customers' problems are the reason for each ticket.

```
Phase 1  Monolith          Browser -> Next.js (RSC + Server Actions) -> Postgres
Phase 2  The product grows Browser -> Next.js -> Postgres      + worker (pg-boss) + outbox + OTel/Grafana
Phase 3  Extract Deals     Browser -> Next.js (BFF) -> Spring Boot (deals) -> Postgres (own schema)
Phase 4  Production        Caddy -> web x2 -> service -> Postgres, Redis; CI, CSP, rate limits, game day
```

Legend: **F** feature · **I** incident (a planted bug you find) · **D** design review (you write an ADR *before* coding) · **H** hardening.

| Phase | Activities | Estimate | At 15 h/week (5 x 3 h) | Fits a 2-3 week cap (30-45 h)? |
| --- | --- | --- | --- | --- |
| 1. Monolith | A01-A09 | ~33.5 h (31 h before the diagnostic) | ~2.2 weeks | yes, inside 3 weeks, just over 2 |
| 2. Product grows (outline) | A10-A22 | ~48 h | ~3.2 weeks | **no**: trim or split when it is generated |
| 3. Extract Deals (outline, beginner Java) | A23-A32 + ~12 h Java primer | ~63 h | ~4.2 weeks | **no**: split into two phases (extraction, then the BFF hardening) |
| 4. Production (outline) | A33-A38 | ~23 h | ~1.5 weeks | yes |
| **Total** | 38 activities | **~168 h** | **~11 weeks** | |

The estimates are mine. `PROGRESS.md` has a column for your actual hours; Phase 2 is re-estimated from the ratio of actual to estimated.

Estimates for Phases 2-4 will be redone from your actual Phase 1 pace.

### How the ramp works

The ramp is **per skill**, not global: a Java activity in Phase 3 starts guided even though the course is at its hardest there.

| Level | What the ticket spells out |
| --- | --- |
| L1 guided | Files, interfaces and steps; you fill in the mechanism. |
| L2 | Requirements and a given interface (seam); design inside it is yours. |
| L3 | Behaviour and constraints only; you choose structure and tables inside the stack. |
| L4 | A business ticket and the acceptance tests; an ADR is required for the decision. |

Phase 1 runs A01-A04 at L1, A05-A09 at L2/L3.

---

## 2. Phase 1: Monolith (Next.js + Postgres), ~33.5 h. Generated; awaiting your review.

Every Phase 1 test is black-box: it asserts HTTP, database or browser behaviour (plus `EXPLAIN` plan shapes), never wall-clock time
and never how your code is organised, with three named exceptions: the **seam test** below (A05, tightened in A07), A07's check that no client component
imports the DAL, and the structure check on A09's ADR file. "Browser" tests need Chromium (A01 checks it launches).

| # | Kind | Ticket | Goal | h |
| --- | --- | --- | --- | --- |
| 01 | F | Boot the platform | Compose Postgres, migrations, and a deterministic 10k+ seed running, with the activity runner showing its first red test. | 1.5 |
| 02 | F | Model the CRM | Design a tenant-safe schema (orgs, memberships, companies, contacts, deals, stages) whose database itself refuses bad data. | 3 |
| 03 | F | Contacts at 10k rows | Per-org App Router structure and a URL-driven list (filter, sort, page), streamed under Cache Components, within a query-plan budget. | 5.5 |
| 04 | F | Create and edit contacts | Server Actions with server-side validation, field errors, a pending state, and a page that is fresh right after your own write. | 4.5 |
| 05 | F | Sessions from first principles | Password hashing, session tokens, cookies and logout, with no auth library, behind your own `getSession()`. | 5 |
| 06 | I | CSRF and the proxy gate | See what Server Actions check for free and what route handlers don't, and what a proxy gate really covers. | 3 |
| 07 | F | Who is asking, and for which org? | A data access layer, `requireRole()`, and the admin/manager/rep permission matrix enforced where the data is read. | 4 |
| 08 | I | "Kestrel Solar can see Acme's contacts" | Reproduce, locate and fix a cross-tenant leak, at the right layer. | 3 |
| 09 | D | Post-incident: how do we isolate tenants for good? | Choose an isolation strategy in an ADR, then implement a second wall behind your DAL. | 4 |

### The seam (acceptance criterion for A05, A07 and later A10)

Authentication lives behind **two functions exported from the DAL**: `getSession()` (who is signed in, or nobody) and
`requireRole(...)` (the signed-in member of *this* org with at least *this* role, or a refusal). Their exact signatures are fixed in the
A05 and A07 tickets and may not change afterwards. **Everything else in the app calls only those two.**

- **Seam test (A05, tightened in A07):** nothing outside `lib/dal/` and `lib/auth/` may import from `lib/auth/`, read the session cookie, query the
  sessions table or touch password hashes. The test fails on a violating import.
- **A10 acceptance:** after swapping the implementation behind the seam for Better Auth, the **entire A05-A09 test suite passes unmodified**,
  existing users can still sign in, and no caller changed.

### What each Phase 1 activity's tests check

(Behaviours only. The mechanisms are yours to find.)

- **A01.** `docker compose up --wait` gives a healthy Postgres 18; migrations apply to an empty database; `npm run db:seed` produces the documented
  row counts and the same content on a second run; `npm run act -- 01` runs and shows one failing test you fix; a "browser can launch" check
  says exactly what to install if it can't. `npm run psql` opens `psql` through `docker compose exec`.
- **A02.** All migrations apply to an empty database; the database rejects a record that references another org's company or contact
  (SQLSTATE `23503`), duplicate emails within one org but allows them across orgs, a negative deal value, and a deal placed in another org's stage; every tenant
  table has a non-null org; the provided seed loads into your schema.
- **A03.** The default list shows 25 rows, newest first; `q`, sort and page are driven by the URL and survive reload and the back button; walking every
  page of the smallest org returns every contact exactly once; bad parameters fall back safely; an unknown org is a 404; the build output marks the route
  as a partial prerender; **the default list query and the search each stay inside a plan budget** (no `Sort`, no sequential scan on `contacts`).
- **A04.** Invalid input returns field errors and writes nothing; valid input writes once; the pending state is visible; the same page shows your write
  immediately after the action (no redirect); duplicates within an org are refused with a readable message; no SQL or stack trace reaches the browser.
- **A05.** Register, sign in, sign out over HTTP; passwords are stored with a memory-hard hash and a per-user salt; the session token is random, and only a
  hash of it is stored; cookie attributes are correct; a new login invalidates the old token; sign-out invalidates the token server-side; expired sessions are
  refused; wrong password and unknown email look the same; the seam test passes.
- **A06.** Cross-origin mutations to route handlers are refused and same-origin ones accepted; unauthenticated page requests are redirected; **every route
  that returns data refuses an unauthenticated request, including routes the starter proxy does not match.**
- **A07.** A table-driven matrix of role x operation x ownership; data comes back only for the signed-in org; payloads contain no password hash or
  internal fields; no client component imports the DAL; the seam test is now strict.
- **A08.** The failing reproduction you are given turns green on every path (page, action, route handler); a generic test walks every DAL entry point
  that takes an id and requires an other-org id to find nothing.
- **A09.** The ADR file has the required structure (context, 3+ options each with a failure mode, decision, consequences); **whichever strategy you
  chose,** a query run with the application's own database credentials and no tenant context cannot read another org's rows; context cannot leak between two
  requests that share a pooled connection; the A03 plan budget still holds.

### Things Phase 1 tests will deliberately not ask for

- "Works without JavaScript" on forms behind `<Suspense>`: with a prerendered shell the streamed form is hidden until JS runs (spike S3).
- Timing thresholds of any kind.

---

## 3. Phases 2-4: outline only

Titles and goals will be revised when each phase is generated. Items marked *(changed)* differ from the version you saw first.

### Phase 2: The product grows, ~48 h

| # | Kind | Ticket | Goal |
| --- | --- | --- | --- |
| 10 | F | Replace our homemade auth | Reimplement `getSession()` / `requireRole()` on Better Auth *(changed: the seam is the acceptance test)*; migrate real users; A05-A09 pass untouched. |
| 11 | F | The deal board | Kanban with a client-side drag island, a serialisable boundary, and an optimistic move with rollback. |
| 12 | I | "My deal value changed back by itself" | Two reps edit one deal: find the lost update; make conflicts explicit. |
| 13 | I | "I clicked Save once and got two deals" | Make retries and double-submits safe. |
| 14 | F | Activity timeline | A cursor-paged feed, and a reasoned choice between a Route Handler and a Server Action for "load older". |
| 15 | F | Tasks and reminders | A separate worker process with scheduled, retried jobs that must not fire twice. |
| 16 | F | Import 10,000 contacts from CSV | Upload, streaming parse, dedupe, per-row error report, restartable. |
| 17 | I | "Lumen Dental's dashboard takes 9 seconds" | Find out why; compute pipeline value, win rate, leaderboard and trends in SQL. |
| 18 | F | Charts without the bundle tax | Chart islands on the client side of the boundary, with a bundle budget and an accessible fallback. |
| 19 | I | "I moved a deal to Won, the dashboard didn't change" | Cache the aggregates, then fix what the caching broke. |
| 20 | D | Deal changes must reach the timeline and notifications | ADR on delivery guarantees, then a transactional outbox with idempotent consumers. |
| 21 | F | Where did the time go? | Structured logs, traces and metrics across web and worker; find the slow span. |
| 22 | H | Metadata, images, fonts, vitals | Per-route metadata, `next/image`, `next/font`, a measurable performance budget. |

### Phase 3: Extract Deals into Spring Boot, ~63 h for a Java beginner

Before A25 you do a **Java primer (~12 h)** I write in `course/primers/`: the language you need, Maven, JUnit, and the Spring concepts the service uses
(beans and injection, controllers, JPA entities, transactions). The Java activities start at L1 (guided) and ramp back up; the TypeScript-side
activities keep their normal level.

| # | Kind | Ticket | Goal | h |
| --- | --- | --- | --- | --- |
| 23 | D | Draw the boundary | ADR: what moves, who owns which tables, how you migrate without a big bang. | 2 |
| 24 | F | Seam first | Put deals behind a port and write the contract suite every implementation must pass. | 3 |
| 25 | F | Spring Boot skeleton | Java 25 service owning its own schema, locked-down DB role, tested against a real Postgres, shipped as an image. | 7 |
| 26 | F | Deals API | Reimplement deals in Spring with explicit concurrency control, a standard error format and SQL reporting. | 10 |
| 27 | F | The contract | A versioned OpenAPI spec, a typed TS client, and drift detection. | 4 |
| 28 | D | Who vouches for the user? | ADR on service-to-service identity, then verify identity, tenant and role in the service. | 8 |
| 29 | F | When the service says no | Map errors, timeouts and conflicts across the boundary without leaking internals; one trace across both stacks. | 4 |
| 30 | I | "The dashboard is wrong, but only after the nightly job" | Stale data when the writer is no longer your process; decide where caching and validation live now. | 3 |
| 31 | F | Events across a network | Service-side outbox to a signed webhook to an idempotent consumer, under duplicates and reordering. | 6 |
| 32 | H | Ship a breaking change safely | Evolve a live API (additive, then breaking) with old clients still passing. | 4 |

### Phase 4: Production, ~23 h

| # | Kind | Ticket | Goal | h |
| --- | --- | --- | --- | --- |
| 33 | D | Trust the pipeline | Testing-strategy ADR and CI for both stacks. | 4 |
| 34 | **D** *(changed)* | Security review findings | ADR: choose a Content-Security-Policy strategy and security headers that coexist with the static shell; implement and prove it. | 4 |
| 35 | H | Credential stuffing at 3 a.m. | Rate limiting: algorithm, key choice, trusted-proxy handling. | 3 |
| 36 | F | Ship it | Compose deployment: images, healthchecks, migrations, reverse proxy, runtime config. | 5 |
| 37 | I | "Two replicas, one stale dashboard" | Diagnose multi-instance cache and Server Action failures; choose and implement a fix. | 3 |
| 38 | H | Game day | Load test on the seed data, kill the service mid-import, restore from backup, write the runbook. | 4 |

Design reviews: **A09, A20, A23, A28, A33, A34** (six). Incidents: **A06, A08, A12, A13, A17, A19, A30, A37** (eight).

---

## 4. Repo mechanics

- **`main` is learner-facing:** course README, each activity's `ACTIVITY.md`, hints and tests, the app skeleton with stubs, scripts, and this plan.
  **No solutions, no answer keys, no spike code.** Hints stay on `main` (decision 4).
- **`reference` is everything:** the full implementation built one activity at a time, each end state tagged `ref/NN-slug`; `solution/SOLUTION.md` per activity;
  teacher notes (`course/teacher/`, including the spike findings) and `spikes/`.
  I do not write an activity's `SOLUTION.md` until its tests pass on `reference`, and I record the command output.
- **You never switch branches mid-activity.** `npm run solution 05` prints activity 05's `SOLUTION.md` from `reference` with `git show`
  (`npm run -s solution 05` drops npm's banner; `-- --list` lists the files). I work on `reference` in a separate `git worktree`, so your checkout stays on your branch.
- **Tests:** `tests/activities/NN-slug/` (Vitest, Playwright) and the service's `src/test/` (JUnit). `npm run act -- 07` runs one activity;
  `npm run act:upto -- 07` runs everything up to your current point. CI on `main` runs only `act:upto` for the activity you marked done, so red-by-design tests
  don't turn CI red.
- **ADR activities** can't be fully graded by machine: the test checks the ADR's structure and that the behavioural tests pass for whichever option you
  chose. Judging the reasoning is the self-review rubric plus the reference ADR.
- **Layout:** the Next.js app stays at the repo root; the worker is part of it; the Spring service lives in `services/deals/`; `compose.yaml` at the root.
  Node is pinned in `.nvmrc` (`scripts/install-node.sh`, `source scripts/use-node.sh`). JDK 25 is installed in Phase 3 the same way.
- **One commit per phase on `main`** (`course: phase N`), tagged `course/phase-N`.

---

## 5. Phase gate: what happens before each phase is generated

1. Recalibrate from `PROGRESS.md` (where you were slow or wrong), and re-estimate the phase.
2. Re-check every version the phase uses (registries), and read the matching Next.js/Spring docs.
3. **Spike every open risk the phase depends on, on `reference`, timeboxed, and report findings** to you before writing any activity.
4. Generate the activities; build the reference one activity at a time; tag each end state; write the solution only after its tests pass.
5. Stop for your review.

### Spike plan per phase

| Phase | Spikes (each on `reference`, ~45 min box) |
| --- | --- |
| 1 | **Done 2026-10-26:** Docker/Compose/Testcontainers; Postgres 18 + Drizzle; Next 16.4 caching and actions; Playwright/Vitest; shadcn; seed and plan stability; hashing. Findings: `course/teacher/spikes/PHASE-1.md` on `reference` (`git show reference:course/teacher/spikes/PHASE-1.md`). |
| 2 | Better Auth 1.7.13 under Cache Components with a custom password hasher (can it verify A05 hashes?); `@dnd-kit/react` 0.5.1 on React 19.3; pg-boss 12 enqueue inside the caller's transaction; OpenTelemetry in Next 16.4 and a worker; what `grafana/otel-lgtm` bundles; streaming CSV upload through a Route Handler vs the Server Action body limit; Recharts 3.10.1 bundle impact. |
| 3 | JDK 25 and the Maven 3.9.16 wrapper installed in `~/.local`; Spring Boot 4.1.2 skeleton with Testcontainers 2 under WSL Docker; springdoc 3.2.0 on Boot 4.1.2 (its POM still builds on Jackson 2 while Boot 4 uses Jackson 3); Spring Security 7.1 validating Better Auth's JWKS; `openapi-typescript` on springdoc's output. |
| 4 | CSP nonces vs the prerendered shell (facts for A34's reference ADR); custom `cacheHandlers` with Redis across two replicas (A37); Caddy streaming without buffering; Next standalone image and runtime env; Playwright system packages on the CI runner. |

---

## 6. Stack and ADRs

Exact pins go in lockfiles and in `course/VERSIONS.md` with the check date. Rows marked "Phase 1: verified" were run in the spikes.

| Tool | Pick | Evidence | Phase |
| --- | --- | --- | --- |
| Next.js | **16.4.3** (Cache Components + Partial Prefetching on by default) | npm; installed | all |
| React | 19.3.x (lockfile 19.3.0, `latest` 19.3.1; App Router uses Next's bundled React) | npm | all |
| TypeScript | **5.9.3**, not 7.0.2 (ADR-001) | npm; typescript-eslint peer range | all |
| Node | **24.22.1** from `.nvmrc` | endoflife.date; nodejs.org | all |
| Postgres | **18** (18.6 in the image) | Docker Hub; Phase 1: verified | all |
| Drizzle ORM / kit | **0.45.4 / 0.31.11** (1.0 is `rc.5`) | npm; Phase 1: verified | 1+ |
| Zod | 4.6.7 | npm | 1+ |
| Vitest / Playwright | 5.0.5 / 1.64.1 | npm; Phase 1: verified | all |
| Testcontainers (JS) | 12.2.1 | npm; Phase 1: verified | all |
| @faker-js/faker | 10.6.0 | npm; Phase 1: verified | 1 |
| shadcn CLI / Tailwind | 4.22.1 / 4.3.3 | npm; Phase 1: verified | all |
| Password hashing | `node:crypto` scrypt or `@node-rs/argon2` 2.2.2 (learner's choice) | Phase 1: verified | 1 |
| Better Auth | **1.7.13** (docs: "fully compatible with Next.js 16") | npm; better-auth.com | 2+ |
| Recharts | 3.10.1 | npm | 2 |
| `@dnd-kit/react` | **0.5.1, exact** | npm | 2 |
| pg-boss / csv-parse | 12.38.0 / 7.0.3 | npm | 2 |
| OpenTelemetry (JS) / pino | `@opentelemetry/api` 1.10.0, `@vercel/otel` 2.1.3 (final after reading Next's OTel guide) / 10.4.0 | npm | 2 |
| Grafana LGTM | `grafana/otel-lgtm` (pin later) | Docker Hub | 2 |
| openapi-typescript / openapi-fetch | 7.13.0 / 0.17.0 | npm | 3 |
| Spring Boot | **4.1.2** (Maven Central's "latest" is `4.2.0-RC1`) | start.spring.io; endoflife.date | 3 |
| Java | **25 LTS** (Temurin 25.0.5+8), not 27 (non-LTS) | Adoptium; endoflife.date | 3 |
| Maven | wrapper pinned to **3.9.16** ("latest" there is `4.0.0-rc-7`) | Maven Central | 3 |
| Boot-managed (do not pin separately) | Spring Framework 7.0.8, Security 7.1.0, Hibernate 7.4, Flyway 12.4.0, Testcontainers 2.0.x | Boot 4.1 release notes | 3 |
| springdoc-openapi | 3.2.0 (see section 5) | Maven Central | 3 |
| Caddy / Redis | `caddy:2-alpine`, `redis:8-alpine` (pin later) | Docker Hub | 4 |

### ADR-001: Next.js 16.4 with Cache Components, TypeScript 5.9, Node 24
- **Decision:** the installed Next.js 16.4.3 and its scaffold defaults. TypeScript stays at 5.9.3. Node is 24.22.1, pinned in `.nvmrc`.
- **Why:** Cache Components is the default in `create-next-app` and will be Next 17's default (16.4 release notes), so you learn the model you will keep.
  TypeScript 7.0.2 is `latest`, but typescript-eslint 8.72.0 declares `typescript >=4.8.4 <6.1.0`, so type-aware lint would not support it, and I have not tested Next 16.4
  on TS 7. Node 22 ends on 2027-04-30, Node 24 on 2028-04-30; Vitest 5 and pg-boss 12 accept both.
- **Rejected:** TS 7 (ecosystem not ready), Node 22 (shorter runway than the course), Node 26 (becomes LTS on 2026-10-28).
- **Revisit when:** typescript-eslint supports TS 7.

### ADR-002: Postgres 18 and Drizzle
- **Decision:** Postgres 18; Drizzle ORM pinned at 0.45.4 with drizzle-kit migrations.
- **Why Drizzle: it is SQL-first, so the problems this course teaches stay visible in your own code.** Each query is something you wrote and can print: a
  loop of builder calls *is* the N+1 (A17), and `GROUP BY ... FILTER`, window functions and CTEs are written in the SQL's own shape rather than hidden behind a
  relation-loading abstraction (A17-A19). That makes the loop the course needs short: write the query, `EXPLAIN` it, change it. Phase 1 already paid off
  there: the index-versus-`ORDER BY` mismatch in A03 (a `Sort` over a sequential scan, 100x slower) is something you find by reading the SQL and its plan.
- **Costs I observed:** it is pre-1.0 (stable `latest` is 0.45.4; 1.0 is at `rc.5`), so the API will change; it wraps driver errors (`DrizzleQueryError`, with the SQLSTATE
  on `error.cause.code`), which tests and error handling must unwrap; and it gives you less for free than a higher-level ORM.
- **Rejected:** Prisma. The `prisma` CLI's `latest` dist-tag being an 8.0 release candidate is **not** a reason: the answer to a pre-release tag is to pin
  (`prisma` and `@prisma/client` 7.10.1), not to choose a different tool. Prisma 7.10.1 would be a legitimate choice for a productivity-first CRM. I rejected it only
  because its abstraction is the opposite of what this course wants you to see. Raw `pg` alone was rejected as too much boilerplate for the learner to spend time on.
- **Revisit when:** Drizzle 1.0 becomes `latest`. The API will change, so I pin 0.45.4 and offer the migration as a stretch.

### ADR-003: Auth: build it once, then adopt Better Auth for authentication only
- **Decision:** A05-A07 hand-roll sessions behind the `getSession()` / `requireRole()` seam in the DAL. A10 reimplements that seam on Better Auth 1.7.
  **Tenancy and RBAC stay in our own tables and DAL**, not in Better Auth's organization plugin.
- **Why:** Auth.js is out: `next-auth` `latest` is still 4.x, v5 is still `5.0.0-beta.32`, and the Better Auth team now maintains it in security-patch mode and recommends
  Better Auth for new projects. Better Auth's docs say Next.js 16 is supported and call a bare cookie check in `proxy` "NOT SECURE", which is the lesson of A06. Memberships, roles and the active org
  are *domain* data: tests, the Spring service's token claims and the DAL all need them, and a vendor plugin's schema would couple all three to the vendor.
  The seam makes the swap a single-module change, and the "A05-A09 pass unmodified" rule is how that is proven.
- **Rejected:** Auth.js (above); Better Auth's organization plugin (it works and supports custom roles, but ties our tenant model to its tables); iron-session (Next's own
  Cache Components example uses it, but it is stateless, so it cannot teach revocation).
- **Risk:** Better Auth's Next.js page doesn't mention Cache Components; spiked before Phase 2 is generated.

### ADR-004: Tenant model baseline
- **Decision:** shared schema, `org_id` on every tenant table, org in the URL (`/[orgSlug]/...`), membership checked per request.
- **Why:** it is the common SaaS default, URLs are explicit and testable, and it gives A08 a real surface. The *long-term* isolation strategy is **your** ADR in A09.

### ADR-005: Forms and URL state
- **Decision:** native `<form>` + Server Actions + `useActionState` + Zod 4. No form library, no TanStack Table, no `nuqs` in the core path.
- **Why:** the course teaches the platform primitives; each library is a way to avoid learning what it wraps. `nuqs` (2.10.2) is a stretch in A03.

### ADR-006: Charts and drag-and-drop
- **Decision:** Recharts 3.10.1; `@dnd-kit/react` **pinned to the exact version 0.5.1** (installed with `--save-exact`, no `^`), wrapped in one component.
- **Why:** Recharts is React-composable SVG, fine because A17 aggregates in SQL so charts get tens of points, never thousands. ECharts 6 solves a larger-data problem
  than this one; visx 4 is lower-level than the learning goal. The Kanban UI is **given** (the lesson is the boundary, the optimistic update and concurrency), so a pre-1.0
  library is contained behind one wrapper; its sub-packages (`@dnd-kit/dom` and friends) are pinned by the lockfile. The older `@dnd-kit/core` 6.3.1 has not been updated since 2024-12.
- **Fallback:** `@atlaskit/pragmatic-drag-and-drop` 4.0.0 if `@dnd-kit/react` misbehaves on React 19.3; decided in the Phase 2 spike.

### ADR-007: Background work: Postgres-backed, separate process, hand-built outbox
- **Decision:** a `worker/` process using pg-boss 12 for scheduled and retried jobs. The transactional outbox is written by you (A20), not bought.
- **Why:** pg-boss needs no new infrastructure, and the outbox is a lesson, not a dependency. Next.js is a request server, not a worker host. BullMQ 6.4 is good but adds Redis in
  Phase 2 with no problem yet to justify it.
- **Rejected:** jobs inside Next via `instrumentation.ts`; BullMQ (infrastructure before need).

### ADR-008: The extracted service: Spring Boot 4.1.2, Java 25, Maven
- **Decision:** Spring Boot 4.1.2 on Java 25 LTS; Maven with the wrapper at 3.9.16; Spring Data JPA (Hibernate) for entities, `JdbcClient` for reporting SQL; Flyway;
  Spring Security 7 as an OAuth2 resource server.
- **Why:** 4.1.x is current and supported to 2027-07-31. JPA's `@Version` gives optimistic locking to compare with A12's hand-rolled one; the reporting side shows that an ORM is
  not for everything. Boot 4 modularised starters, moved to Jackson 3 and added `spring-boot-starter-opentelemetry` (4.0 release notes), so the primer and hints target **4.x**,
  not the 3.x most tutorials show. For a Java beginner, Maven's wrapper means nothing to install but the JDK.
- **Rejected:** Boot 4.2.0-RC1; Java 27 (non-LTS); Gradle (equal; Maven is the more common default); jOOQ (needs a codegen step that is a distraction).
- **Do not pin separately:** Flyway (Boot manages 12.4.0 although Maven Central's latest is 13.11.1) and Testcontainers.

### ADR-009: Contract: OpenAPI as the source of truth, `openapi-typescript` + `openapi-fetch`
- **Decision:** the spec is a committed file; CI fails if the service's generated spec differs; the TS client is generated types plus a thin fetch wrapper (size not measured).
- **Why:** types come from the spec, with no generated runtime classes to maintain. `@hey-api/openapi-ts` (0.99.0) is richer but pre-1.0 and generates much code to review.
- **Whether the spec is written first or generated from the controllers** is part of A23/A27's design choice, not decided here.

### ADR-010: Testing
- **Decision:** Vitest 5 for unit and integration, Playwright 1.64 for e2e against the **production build** (dev and production differ: sync `params` logged an error in dev and failed silently in
  production), Testcontainers or the compose database for real Postgres in both stacks.
- **Why:** mocks hide exactly the bugs this course plants (tenant predicates, transactions, cache behaviour). Tests assert query counts and plan shapes, not milliseconds. Where a behaviour can
  be asserted over plain HTTP against the production server, tests do that (it needs no browser and takes milliseconds); the browser is used only for what needs JavaScript.
- **Needs:** Docker reachable from WSL (verified) and, for Playwright, `libnspr4`, `libnss3`, `libasound2t64` on Ubuntu 26.04 (A01 checks).

### ADR-011: Observability: OpenTelemetry end to end
- **Decision:** OpenTelemetry in Next, the worker and Spring; one `grafana/otel-lgtm` container as backend and UI (what it bundles I confirm when I first run it); pino with trace ids for logs.
- **Why:** one trace across the browser request, Next, Postgres, worker and Spring is what makes A29 concrete. Bundled docs include `open-telemetry.md` and `instrumentation.md`; read before Phase 2.

### ADR-012: Infrastructure arrives when a problem needs it
- **Decision:** Phases 1-3 run Postgres only (plus Grafana). Caddy, a second web replica and **Redis arrive in Phase 4** because A35 (shared rate-limit state) and A37 (shared cache and tag
  coordination) cannot be solved without them.
- **Why:** the bundled self-hosting guide says the default cache is in-memory and unshared, `revalidateTag` invalidates only the instance that ran it, and a mismatched
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` across instances gives "Failed to find Server Action". You should feel those before you meet the cure.

---

## 7. Coverage of your "must cover" list

| You asked for | Where |
| --- | --- |
| App Router structure | A03 (route groups, `[orgSlug]`, loading/not-found), A22 |
| Server/Client boundary, serialisation | A11, A18 (and A04) |
| Streaming with Suspense | A03, A17, A19 |
| searchParams-driven filter and pagination | A03 |
| Server Actions with validation and optimistic UI | A04, A11, A13 |
| Current caching and revalidation model | A03, A04, A19, A30, A37 |
| Route Handlers vs Server Actions | A06, A14, A16, A31 |
| proxy/middleware and why it can't be the only check | A06 |
| Metadata, images, performance | A22 |
| Session auth from scratch, then a library | A05-A06, A10 |
| RBAC and tenant isolation in a DAL | A07-A09 |
| Charts: aggregate in SQL, cache, keep libs client-side | A17, A19, A18 |
| Domain modelling, layering, ADRs | A02, A07, A24; ADRs in A09, A20, A23, A28, A33, A34 |
| API design and versioning | A27, A32 |
| Optimistic concurrency, idempotency | A12, A13, A26; A16, A31, A32 |
| Background jobs, transactional outbox | A15, A20, A31 |
| Observability | A21, A29 |
| Testing strategy and CI | A33 (and tests in every activity) |
| Docker Compose, security headers, rate limiting | A36, A34, A35 |
| Seed data, 10k+ contacts | A01 (50k contacts, 5k companies, 300k activity rows; verified to seed in 22 s) |
| Incidents (IDOR, N+1, lost update, stale cache) | A08, A17, A12, A19 (plus A06, A13, A30, A37) |
| At least two design reviews | A09, A20, A23, A28, A33, A34 |

---

## 8. Risks and what is not verified

Resolved by Phase 1 spikes: Docker in WSL, `uuidv7()` in Postgres 18, Drizzle on Node 24 and Next 16.4, Vitest/Playwright on Node 24 (with three system packages), shadcn on the scaffold.

Still open, to be spiked before the phase that needs them (section 5):

1. Better Auth under Cache Components, and whether it can verify A05's password hashes. *(Phase 2)*
2. `@dnd-kit/react` 0.5.1 on React 19.3. *(Phase 2)*
3. springdoc 3.2.0 on Boot 4.1.2 (Jackson 2 vs 3). *(Phase 3)*
4. Custom `cacheHandlers` with Redis for A37. *(Phase 4)*
5. CSP nonces against the static shell: the facts for A34's reference ADR. *(Phase 4)*
6. Drizzle 1.0 may become stable mid-course. Pinned.
7. Why `redirect()` after a Server Action makes `revalidateTag(tag, 'max')` appear fresh is **unexplained**; the course states only what was observed.
8. npm 11 prints `install-scripts` / `allowScripts` warnings; a dependency that needs a postinstall could be skipped in future.
9. Docs not yet read for this Next.js version (read before the phase that teaches them): forms, server-actions security details, open-telemetry, instrumentation, testing guides, `cacheHandlers`,
   `use cache: private/remote`, content-security-policy, production-checklist, images, fonts, metadata.
10. Versions drift: lockfiles pin exact versions; I re-check at the start of each phase.

---

## 9. What I need from you next

1. Answer `DIAGNOSTIC.md` (reply in chat or write under each "Your answer"; answer from your own mental model first, with a confidence of 1-3).
2. Tell me to start Phase 1 generation once you have. Phase 1 will also be recalibrated from the diagnostic.
