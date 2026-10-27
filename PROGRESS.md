# Progress

State of the course. Updated after each step. Struggles are recorded so later activities can adapt.

## Status

| Step | State |
| --- | --- |
| 0. Ground truth | Done 2026-10-26. See `GROUND_TRUTH.md`. App scaffolded (Next.js 16.4.3, React 19.3.0). |
| 1. Diagnostic | Answered 2026-10-27. Score **3.0 / 10** (provisional, see below). |
| 2. Course plan | `course/PLAN.md` approved for Phase 1 (A01-A09); Phases 2-4 are an outline. |
| 3. Phase 1 | Generated 2026-10-27 (A01-A09, ~33.5 h). Verified on the reference branch: `npm run act:upto -- 9` passes, also with the test files in shuffled orders. **Waiting for your review.** No activity has been started by the learner yet. |

## Learner profile

- Software engineering student; comfortable with TypeScript, React, SQL, full-stack basics. Java: beginner.
- Last Next.js: "pretty recent", App Router, exact version not remembered. No old project to calibrate from; the CRM course is the project.
- Time: 14 h/week stated for the course; for Phase 1, "2 weeks, 3 hours each day" (about 42 h if every day counts). Phase 1 is estimated at ~33 h.

## Diagnostic results (2026-10-27)

| Q | Topic | Era | Score | Confidence | Note |
| --- | --- | --- | --- | --- | --- |
| 1 | Where client-imported code runs | 13/14 | 0.5 | 3 | Outcome right (both); rule not stated. Becomes 1 with a one-sentence rule. |
| 2 | Function prop across the boundary | 13/14 | 0.5 | 3 | Serialisation right; stage wrong (said browser/hydration; it is the server, at `next build` and in dev). |
| 3 | `redirect()` inside `try/catch` | 13/14 | 1 | 2 | Correct. |
| 4 | `useActionState` signature | 13/14 | 1 | 2 | Correct. |
| 5 | Sync `params` | 15/16 | 0 | 1 | Expected a build error and a prod throw; the real behaviour is a silent `undefined`. |
| 6-10 | Cache Components model | 16.x | 0 | unsure | No prior model: teach from zero. |

**Placement:** 13/14-era App Router basics mostly solid (3 of 4). The async request APIs and the Cache Components model are new.

## Struggles and adaptations

| Observed | Mechanism misunderstood | Adaptation |
| --- | --- | --- |
| Q2: put a serialisation failure in the browser, confidence 3 | *When* each kind of error surfaces (editor, `tsc`, `next build`, dev server, browser). Server Components render on the server, so boundary errors appear there, never at hydration. | A04 includes a "where does it surface?" table and a deliberate boundary error to predict and then run. A03 repeats the habit: predict before you run. |
| Q5: assumed types or a throw would catch sync `params` | Next does not type-check the shape of page props, and destructuring a Promise yields `undefined` without an error. | A03 includes the sync `params` trap as a predict-then-run exercise. |
| Q6-10: no model of Cache Components | Data access is dynamic by default; every route must produce a static shell; uncached I/O needs `<Suspense>` or `use cache`. | A03 gets a primer and its tests assert the shell; A04 teaches `updateTag` and why the difference only shows on a same-page action. Time: A03 4 -> 5.5 h, A04 4 -> 4.5 h. |
| Calibration | Confident where wrong (Q2), under-confident where right (Q3, Q4). | Each activity ends with a confidence check against the test results. |

Open question for the learner: Q1's one-sentence rule.

## Repo notes

- The CI typegen fix and the app scaffold are on `main` (PR #4). PR #5 (`chore/course-setup`) carries Node 24 from `.nvmrc`, `npm run solution`, and `course/PLAN.md`.
