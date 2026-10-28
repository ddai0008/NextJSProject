# NextJSProject

Notes for the development agent and for people. Keep this short and true: the agent reads it at the start of every run.

## Commands
- `node` is not on PATH in this WSL setup (the `npm` that is on PATH is the Windows one). The Node version lives in `.nvmrc` (CI reads it too). Install it once with `scripts/install-node.sh`, then run `source scripts/use-node.sh` in every new shell before `node` / `npm`.
- Dev: `npm run dev`. Build: `npm run build`. Lint: `npm run lint`.
- Typecheck: `npx next typegen && npx tsc --noEmit`. Run `typegen` first: `PageProps` / `LayoutProps` are generated globals, so bare `tsc` fails on a clean checkout.
- Solutions: `npm run solution 05` prints activity 05's reference solution from the `reference` branch via `git show` (add `-s` to drop npm's banner, `-- --list` to list files). Never check `reference` out in this working tree; to work on it use a separate `git worktree`.
- Docker: `docker ps` must work in WSL (Docker Desktop with WSL integration on). Postgres runs from `compose.yaml` (`npm run db:up`, which also creates the non-superuser owner role `crm`; the container's superuser is `postgres`); use `npm run psql`, not a local `psql`.
- Test: `npm run act -- N` runs activity N's acceptance tests (starts Postgres, builds the app without a database, runs Vitest; `-t "name"` filters, `--no-build` reuses the build). `npm run act:upto -- N` runs A01..N. Browser tests need `sudo apt install libnspr4 libnss3 libasound2t64`. `ACT_APP_AS_OWNER=1` connects the app as the database owner (to test the first wall without row-level security, from A09 on). `npm run start-activity -- N` copies an incident activity's starting code from `reference`.

## Conventions
- This repo is a hands-on course for one learner: a Next.js refresher, then a CRM built in phases (`course/PLAN.md` is the plan and the stack decisions). `GROUND_TRUTH.md` = facts verified against the installed Next.js, `DIAGNOSTIC.md` = the entry diagnostic, `PROGRESS.md` = state and struggles.
- Branches: `main` is learner-facing (activities, hints, tests, scripts, the plan). `reference` holds the reference implementation, `solution/` folders, teacher notes (`course/teacher/`) and spikes. Never put a solution, answer key or spike on `main`.
- Phases are generated one at a time, only after the learner finished the previous one: recalibrate from `PROGRESS.md`, re-check versions, spike each open risk on `reference` and report findings, then generate. An activity's tests must pass on `reference` (tagged `ref/NN-slug`) before its `SOLUTION.md` is written.
- The installed Next.js (see `package.json`) differs from training data. Before writing or teaching any API, read the matching page in `node_modules/next/dist/docs/` (see AGENTS.md) and, where the claim matters, run it. Flag anything unverified.
- Tutoring rules: do not write exercise solutions unless asked; give hints in escalating steps; review code bluntly and name the mechanism that was misunderstood, not just the fix; update `PROGRESS.md` after each module and adapt later modules to it.

## Do not change
- The `nextjs-agent-rules` block in `AGENTS.md`: `next dev` rewrites it.
