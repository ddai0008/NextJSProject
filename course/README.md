# Pipewise CRM: learn modern Next.js and system architecture by building the product

You are an engineer at **Pipewise**, a B2B CRM vendor. Each activity is a ticket from a person at the company or at one of its customers (Kestrel Solar, Acme Freight, Lumen Dental, Harbor & Finch LLP). You do the work, and a set of **runnable acceptance tests** tells you whether it is done. Some tickets are features, some are incidents (a planted bug to find and fix at the right layer), some are design reviews (you write a decision record before you write code).

The course builds the CRM in four phases. **Phase 1 (A01 to A09) is here; Phases 2 to 4 are an outline** in [`PLAN.md`](PLAN.md) and are generated one at a time, after you finish the previous one, recalibrated from [`../PROGRESS.md`](../PROGRESS.md).

## Phase 1: a monolith (Next.js, Postgres, no auth library)

About 35 hours in total. Levels say how much the ticket spells out: **L1** files and steps, **L2** requirements and a given interface, **L3** behaviour and constraints, **L4** a business ticket, an ADR required.

| # | Activity | Kind | Level | h | You learn |
| --- | --- | --- | --- | --- | --- |
| 01 | [Boot the platform](activities/01-boot/ACTIVITY.md) | feature | L1 | 1.5 | Compose, migrations, a deterministic seed, the activity runner |
| 02 | [Model the CRM](activities/02-schema/ACTIVITY.md) | feature | L1 | 3 | A schema whose constraints refuse bad and cross-tenant data |
| 03 | [Contacts at 10k rows](activities/03-contacts-list/ACTIVITY.md) | feature | L1 | 5.5 | App Router, Cache Components, keyset pagination, query-plan budgets |
| 04 | [Create and edit contacts](activities/04-contact-forms/ACTIVITY.md) | feature | L1 | 4.5 | Server Actions, validation, pending state, `updateTag` |
| 05 | [Sessions from first principles](activities/05-sessions/ACTIVITY.md) | feature | L2 | 5 | Password hashing, session tokens, cookies, the auth seam |
| 06 | [CSRF and the proxy gate](activities/06-csrf-and-proxy/ACTIVITY.md) | incident | L2 | 3 | What `proxy.ts` covers, what route handlers need, defence in depth |
| 07 | [Who is asking, and for which organisation?](activities/07-dal-and-roles/ACTIVITY.md) | feature | L2 | 4 | A data access layer, `requireRole`, the role matrix |
| 08 | [Kestrel Solar can see Acme's contacts](activities/08-tenant-leak/ACTIVITY.md) | incident | L3 | 3 | IDOR, fixing at the layer, tests for a class of bug |
| 09 | [Post-incident: how do we isolate tenants for good?](activities/09-tenant-isolation/ACTIVITY.md) | design review | L4 | 5.5 | An ADR, row-level security, the pooling trap, plan budgets, error side channels, the membership table |

```
A01 ─ A02 ─ A03 ─ A04 ─ A05 ─ A06 ─ A07 ─ A08 ─ A09
                          └──── A05's getSession()/requireRole() seam is what A10 (Phase 2) reimplements on Better Auth
```

Each activity builds on the previous one's code. `npm run act:upto -- N` proves nothing earlier broke.

## How an activity works

```
course/activities/NN-name/
  ACTIVITY.md        the ticket, what you will learn, requirements, acceptance criteria, stretch goals, a self-review checklist
  hints/hint-1..3.md a nudge, then a narrowed approach, then outlines close to code. Read them in order, only when stuck
  activity.json      what the runner must start for this activity
```

1. Read `ACTIVITY.md` once, completely. Do the **"Do this first"** part: it asks you to write predictions *before* running anything.
2. Incident activities start from existing code: run `npm run start-activity -- N` once, as the activity says (it copies files; it never overwrites yours).
3. Work. Run `npm run act -- N` as often as you like. Read the **first** failure first; its message is written to say what to look at.
4. Stuck? `hints/hint-1.md`, then 2, then 3.
5. Done? `npm run act:upto -- N`, then the self-review checklist, then `npm run solution N` to read the reference solution and compare. Read it **after** your own attempt: it also records what the author measured and which mutations the tests were checked against.

You do not edit the tests. A test that is wrong is a bug in the course: say so.

## Commands

| Command | What it does |
| --- | --- |
| `npm run act -- N` | Run activity N's acceptance tests. Add `-t "text"` to run tests whose name contains it, `--no-build` to reuse the last build. |
| `npm run act:upto -- N` | Run activities 1 to N. |
| `npm run act -- --list` | List the activities. |
| `ACT_APP_AS_OWNER=1 npm run act -- N` | From A09 on: connect the app as the database owner instead of `crm_app`, to check your own filters without row-level security hiding a mistake. (A09's own tests are expected to fail in this mode.) |
| `npm run solution N` | Print activity N's reference solution (from the `reference` branch, without switching to it). `-- --list` lists its files. |
| `npm run start-activity -- N` | Copy an incident activity's starting code into your tree (`--dry-run` shows what it would add). |
| `npm run db:up` / `db:down` | Start or stop Postgres (Docker Compose). |
| `npm run db:migrate` / `db:seed` / `db:reset` | Apply migrations / load the deterministic seed / start over. |
| `npm run db:grant -- <email> <org> <role>` | Make a registered user a member of an organisation. |
| `npm run psql` | `psql` inside the Postgres container (you need no local `psql`). |
| `npm run dev` / `build` / `lint` / `typecheck` | The usual. |

## What you need

- **Node 24.** `node` may not be on your `PATH` in WSL: run `scripts/install-node.sh` once and `source scripts/use-node.sh` in each new shell (the version is in `.nvmrc`).
- **Docker** with `docker ps` working (Docker Desktop with WSL integration).
- **Chromium libraries** for the browser tests (A01 checks them and prints the fix): `sudo apt install libnspr4 libnss3 libasound2t64`.

## How the tests are built (so you can trust them, or argue with them)

- The runner starts Postgres, builds a test database from your migrations plus a small deterministic seed (cached until a migration changes), gives each run its own copy, builds your app **without** a database (a build that needs one is a bug), starts it with `next start`, runs the tests, and cleans up.
- Tests assert **behaviour**: HTTP responses, database state, what a browser shows, and query-plan shapes. They never assert wall-clock time and never how your code is organised, with named exceptions (the auth seam, the DAL boundary, the shape of A09's ADR).
- Every activity's tests passed on the reference implementation **before** its solution was written, in any file order, and were then checked by **mutation**: deliberate breakages of the reference code, each of which the intended test has to catch. Each `SOLUTION.md` lists them, including the ones that got away and what was changed because of it.

## When something breaks

| You see | Look at |
| --- | --- |
| `docker: ... daemon` / `Cannot connect to the Docker daemon` | Docker Desktop is not running, or WSL integration is off. |
| `error while loading shared libraries: libnspr4.so` | The Chromium libraries above. |
| A test that passed now fails with a message about behaviour you did not touch, right after switching activities | A stale build: drop `--no-build`. |
| Port `55432` already in use | Another Postgres is on it. Stop it, or change the port everywhere it appears (`compose.yaml`, `db/config.ts`, `scripts/lib/db.mjs`, `scripts/seed.mjs`). |
| `next build failed` in the runner | The build runs with no database on purpose; read the log it prints. |

## The documents around this one

[`PLAN.md`](PLAN.md): the plan, stack decisions and ADRs, the later phases. [`../PROGRESS.md`](../PROGRESS.md): where you are, what you struggled with, how later modules adapt. [`../GROUND_TRUTH.md`](../GROUND_TRUTH.md): facts verified against the installed Next.js. [`../DIAGNOSTIC.md`](../DIAGNOSTIC.md): the entry diagnostic.
