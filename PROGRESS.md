# Progress

State of the course. Updated after each step. Struggles are recorded so later activities can adapt.

## Status

| Step | State |
| --- | --- |
| 0. Ground truth | Done 2026-10-26. See `GROUND_TRUTH.md`. App scaffolded (Next.js 16.4.3, React 19.3.0). |
| 1. Diagnostic | Answered 2026-10-27. Score **3.0 / 10** (provisional, see below). |
| 2. Course plan | `course/PLAN.md` approved for Phase 1 (A01-A09); Phases 2-4 are an outline. |
| 3. Phase 1 | Generated 2026-10-27 and revised after two reviews (2026-10-28): A01-A09, ~35 h. Every reference tag `ref/01`..`ref/09` passes the current tests (`npm run act:upto -- N`; `ref/09` runs 113). **Ready to start A01.** Before A01 run `docker compose down -v` once if you ever started the database from an earlier `compose.yaml` (`npm run db:up` tells you). No activity has been started yet. |

## Hours: estimate and actual

Fill in the **Actual** column as you finish each activity (to the nearest half hour, including reading, predictions and the self-review), and say in the last column what took longer or shorter than expected. Phase 2's estimates will be recomputed from the ratio of actual to estimated hours, so honest numbers are worth more than flattering ones.

| Activity | Estimate (h) | Actual (h) | What took longer or shorter, and why |
| --- | --- | --- | --- |
| A01 Boot the platform | 1.5 | | |
| A02 Model the CRM | 3 | | |
| A03 Contacts at 10k rows | 5.5 | | |
| A04 Create and edit contacts | 4.5 | | |
| A05 Sessions from first principles | 5 | | |
| A06 CSRF and the proxy gate | 3 | | |
| A07 Who is asking, and for which organisation? | 4 | | |
| A08 Kestrel Solar can see Acme's contacts | 3 | | |
| A09 Post-incident: how do we isolate tenants for good? | 5.5 | | |
| **Phase 1** | **35** | | |

## Learner profile

- Software engineering student; comfortable with TypeScript, React, SQL, full-stack basics. Java: beginner.
- Last Next.js: "pretty recent", App Router, exact version not remembered. No old project to calibrate from; the CRM course is the project.
- Time: **5 weekdays a week, 3 h a day (15 h/week)**, and a phase should fit in **2 or 3 weeks** (30-45 h) (stated 2026-10-28; earlier: "14 h/week" and "2 weeks, 3 hours each day"). Phase 1 is estimated at ~35 h, about 2.3 weeks: inside the 3-week cap, over the 2-week one.

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
