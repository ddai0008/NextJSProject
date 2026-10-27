# A06 · Hint 2 (narrows the approach)

**Same-site check, as a function.** `function refuseCrossSite(request: Request): Response | null`, called first in each state-changing handler (`const refused = refuseCrossSite(request); if (refused) return refused`).
Inside: read `origin`, `host` and `sec-fetch-site` from `request.headers`. If there is an `Origin`, **parse it with `new URL(...)`** and compare its `.host` to the request's `Host` header. `Origin: null` does not parse, and neither does an attacker's
`http://yoursite:3000.evil.example`; both are refused by the parse failing. Do not use `includes`, `startsWith` or `endsWith` on the raw string: each has a bypass, and test A06.1b tries them. If there is no `Origin`, look at `Sec-Fetch-Site`.

**The proxy.** A file `proxy.ts` at the project root exporting `proxy(request: NextRequest)` and `config`. Allow the public pages, look for the session cookie with `request.cookies.has(name)`, otherwise `NextResponse.redirect(new URL('/login', request.url))`.
Import only the cookie's *name* (put it in a tiny module of its own under `lib/auth/`): the proxy should not drag the database client into its bundle.

**The matcher.** The Next.js docs show a "negative matching" pattern that excludes some paths from the proxy. Read what it excludes. Then run `npm run act -- 6` and see what the walker says about those paths.

**The export endpoint.** Ask the same function everyone else asks: `getSession()` from `@/lib/dal/session`. No session: `401`. Keep the rest of the handler as it is.

**`requireRole`.** Inside it, call `getSession()`; if it returns `null`, `redirect('/login')` (from `next/navigation`). Take the user id from the session instead of the all-zero placeholder. Leave the rest of the stub alone.

**Why two builds.** If a test fails *only* in the "without proxy.ts" groups, a guarantee you thought your code gave was actually given by `proxy.ts`. Find which one.
