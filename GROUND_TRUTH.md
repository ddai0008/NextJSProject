# Ground truth: what is verified about the installed version

Recorded 2026-10-26. Everything under "Verified" was either read in the bundled docs
(`node_modules/next/dist/docs/`, which match the installed version) or run against it.
"Ran" means: a throwaway app with the scaffold's config, `next build` / `next start` / `next dev`.

## Versions

| Thing | Version | Source |
| --- | --- | --- |
| next | 16.4.3 | `create-next-app@16.4.3` (npm `latest`) |
| react / react-dom | 19.3.0 (npm `latest` is 19.3.1; the lockfile pins 19.3.0) | installed |
| typescript | 5.9.3 | installed |
| tailwindcss + `@tailwindcss/turbopack` | 4.3.3 | installed |
| eslint / eslint-config-next | 9.39.5 / 16.4.3 | installed |
| Node | 22.23.4 (Linux, `~/.local/node22`); Next needs >= 20.9 | CI also uses 22 |

Scaffold flags: TypeScript, App Router, ESLint, Tailwind, npm, no `src/`, alias `@/*`.
The scaffold turned **`cacheComponents: true` and `partialPrefetching: true` on by default** in `next.config.ts`,
and bundles `AGENTS.md` pointing at the docs in `node_modules`.

The App Router does not use the `react` package from `package.json` at runtime. It uses the React canary built into
Next (docs/index.md, "React version handling").

## Release notes read (nextjs.org/blog)

- 16.0 (late 2025, exact date not verified): Turbopack default, Cache Components + `use cache`, `proxy` replaces `middleware`, async request APIs enforced, `updateTag`/`refresh`, `revalidateTag` needs a 2nd arg, React 19.2.
- 16.1 (2025-12-18): Turbopack dev disk cache stable, bundle analyzer, `next upgrade`, `next dev --inspect`.
- 16.2 (2026-03-18): bundled version-matched docs + `AGENTS.md`, adapters stable, server-function logging, `unstable_catchError`, `unstable_retry`, `<Link transitionTypes>`.
- 16.3 (2026-08-03): Instant Navigations (Instant Insights, `partialPrefetching`, ISR for Cache Components, Navigation Inspector, `@next/playwright` `instant()`), `catchError` and `retry` stable, `next/root-params`, `io()`, build disk cache default.
- 16.4 (2026-10-06): Cache Components recommended for every app and **default in `create-next-app`; will be the default in Next 17**; `ensureStatic`; `navigation()` / `prefetch()` to defer work; `next upgrade --agent`; React 19.3.

## Verified (ran against 16.4.3 unless noted "docs")

Request APIs and params
- Sync `params` access builds and serves with **no build error and no type error**; the value is `undefined`. Prod: silent. Dev: terminal error `Route "/blog/[slug]" used params.slug. params is a Promise and must be unwrapped with await or React.use()...` but HTTP 200 and still `undefined`.
- Fixing it with `await props.params` (typed with the global `PageProps<'/blog/[slug]'>`) **fails the build** if the page is not behind `<Suspense>` and the route has no `generateStaticParams`: `Next.js encountered uncached or runtime data during prerendering ... outside of <Suspense>`. Passes with `generateStaticParams`, or with the `await` moved into a `<Suspense>` child.
- `PageProps` / `LayoutProps` are generated globals (`next typegen`, also run by `build` / `dev`). Bare `tsc --noEmit` on a clean checkout fails with `TS2304: Cannot find name 'LayoutProps'`. **The CI workflow in `.github/workflows` runs `tsc` before `build`, so it will fail on this scaffold; fix is `npx next typegen` before `tsc` (verified).** Not changed yet.

Cache Components (on in this scaffold)
- Top-level `await fetch(...)` in a page, no Suspense, no `use cache`: build fails, `blocking-prerender-dynamic`; the error offers `[stream]` Suspense, `[cache]` `"use cache"`, `[block]` `export const instant = false`.
- `new Date()` in a Server Component: build fails, `blocking-prerender-current-time`; fixes offered: `await connection()`, `"use cache"`, render on the client.
- `io()` from `next/cache` + `<Suspense>` works (route becomes partial-prerender). Docs prefer `io()` over `connection()` (16.3+) although the build error text still suggests `connection()`.
- `cookies()` inside `"use cache"`: build error `` `cookies()` can't be read inside "use cache" `` (`next-request-in-use-cache`).
- `useSearchParams()` in a Client Component outside `<Suspense>`: build fails, `blocking-prerender-client-hook`.
- `loading.tsx` + async page with an uncached fetch: **builds fine**; `/posts` is partial-prerender and the static shell contains the `loading.tsx` fallback and none of the data.
- `next build` no longer prints size / First Load JS (docs, upgrade guide 16).

Mutation APIs
- `revalidateTag('x')` (one arg): TypeScript error `TS2554: Expected 2 arguments, but got 1`.
- `updateTag` in a Route Handler: builds, then **500 at runtime**: `updateTag can only be called from within a Server Action. To invalidate cache tags in Route Handlers or other contexts, use revalidateTag instead.`
- `redirect()` throws an `Error` with `digest: 'NEXT_REDIRECT;replace;/done;307;'`, so a bare `try/catch` swallows it (ran the function directly).
- `useActionState(action, init)` with a one-arg `(formData)` action: `TS2769 No overload matches this call` at build.

Boundaries
- Function prop from Server to Client Component fails at prerender (not at type check): `Event handlers cannot be passed to Client Component props.` for `on*` names, else `Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server".`
- A file with no directive imported by a `'use client'` file runs on the server (SSR/prerender, log appeared in build output) and is present in the client chunks (grep of `.next/static`).
- `useState` imported in a Server Component: Turbopack build error `You're importing a module that depends on useState into a React Server Component module...`
- `error.js` now receives `retry` (stable 16.3) in addition to `reset`; `error` is typed `unknown`. (docs)

Other
- `middleware.ts` still works but warns `The "middleware" file convention is deprecated. Please use "proxy" instead.`; build lists `ƒ Proxy (Middleware)`. `proxy` runs on the Node.js runtime only; use `middleware` if you need edge (docs).
- `fetch` is not cached by default (since 15); `GET` Route Handlers are not cached by default (since 15) (docs, 15 upgrade guide).

## Flagged: uncertain or not verified

- Whether the Table log in the client-boundary test actually prints in a browser: verified that the code is in the client bundle, did not observe it in a browser (no browser here).
- `'use client'` + `async function Page` builds without error (exit 0). Not verified what the browser does on hydration. Do not teach until checked.
- The scaffold styles with `@tailwindcss/turbopack` (a Turbopack rule in `next.config.ts`), but the bundled CSS docs say `@tailwindcss/postcss`. Both are real Tailwind v4 integrations; the docs lag the template.
- React 19.3 `browser()` API is mentioned in the 16.4 post. Not read in the docs, not used.
- Not yet read for this version: forms / server-actions guides, authentication guides (both), route handlers, metadata + OG images, images, fonts, environment variables, deploying/self-hosting, testing guides, `next/root-params`, `catchError`, `use cache: private/remote`, `instant` / `prefetch` / `ensureStatic` segment config, parallel/intercepting routes. Each is read and spot-checked before the module that teaches it.
