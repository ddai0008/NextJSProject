# Progress

State of the course. Updated after each step. Struggles are recorded so later modules can adapt.

## Status

| Step | State |
| --- | --- |
| 0. Ground truth | Done 2026-10-26. See `GROUND_TRUTH.md`. App scaffolded (Next.js 16.4.3, React 19.3.0). |
| 1. Diagnostic | Issued (`DIAGNOSTIC.md`), **waiting for answers + Q0 intake**. |
| 2. Course (`COURSE.md`) | Not started. Designed only after the diagnostic is answered. |

## Learner profile

- Software engineering student; comfortable with TypeScript, React, full-stack basics.
- Last Next.js version / router: unknown (Q0).
- Goal / deadline / hours per day: unknown (Q0).

## Diagnostic results

_Pending._

## Struggles and adaptations

_None recorded yet._

## Open repo issues found during setup

- CI (`.github/workflows`) runs `tsc --noEmit` before `next build` and will fail on this scaffold (`LayoutProps` is a generated global). Fix: run `npx next typegen` before `tsc`. Not applied yet; nothing is committed.
