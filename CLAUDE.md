# NextJSProject

Notes for the development agent and for people. Keep this short and true: the agent reads it at the start of every run.

## Commands
- `node` is not on PATH in this WSL setup (the `npm` that is on PATH is the Windows one). Run `export PATH=$HOME/.local/node22/bin:$PATH` first.
- Dev: `npm run dev`. Build: `npm run build`. Lint: `npm run lint`.
- Typecheck: `npx next typegen && npx tsc --noEmit`. Run `typegen` first: `PageProps` / `LayoutProps` are generated globals, so bare `tsc` fails on a clean checkout.
- Test: none yet. Added with the course exercises (see COURSE.md once it exists).

## Conventions
- This repo is a Next.js refresher course for one learner. `GROUND_TRUTH.md` = facts verified against the installed version, `COURSE.md` = the plan, `PROGRESS.md` = state and struggles.
- The installed Next.js (see `package.json`) differs from training data. Before writing or teaching any API, read the matching page in `node_modules/next/dist/docs/` (see AGENTS.md) and, where the claim matters, run it. Flag anything unverified.
- Tutoring rules: do not write exercise solutions unless asked; give hints in escalating steps; review code bluntly and name the mechanism that was misunderstood, not just the fix; update `PROGRESS.md` after each module and adapt later modules to it.

## Do not change
- The `nextjs-agent-rules` block in `AGENTS.md`: `next dev` rewrites it.
