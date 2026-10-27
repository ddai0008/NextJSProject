# A06 · Hint 3 (close to code)

The reference solution is `npm run solution 6`. The pieces:

**Same-site helper (`lib/security/same-origin.ts`), in outline:**

```ts
export function refuseCrossSite(request: Request): Response | null {
  const forbidden = () => Response.json({ error: 'Cross-site request refused.' }, { status: 403 })
  const origin = request.headers.get('origin')
  if (origin !== null) {
    let originHost: string | null = null
    try { originHost = new URL(origin).host } catch { /* "null" and garbage do not parse: originHost stays null */ }
    // refuse unless originHost is known AND equals the Host header of this request
  }
  const site = request.headers.get('sec-fetch-site')
  // refuse unless site says the request came from this very origin, or from no page at all
  return null // neither header: not a browser, so not CSRF
}
```

**Using it:**

```ts
export async function POST(request: Request) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  // ... the handler as before
}
```

**The proxy (`proxy.ts` at the project root):**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth/cookie'      // a tiny module: just the name

const PUBLIC_PAGES = new Set(['/', '/login', '/register'])
export function proxy(request: NextRequest) {
  if (PUBLIC_PAGES.has(request.nextUrl.pathname)) return NextResponse.next()
  if (request.cookies.has(COOKIE_NAME)) return NextResponse.next()
  return NextResponse.redirect(new URL('/login', request.url))
}
export const config = { matcher: [/* the pattern from the docs, written for YOUR paths: think about each one */] }
```

**Export endpoint, first lines:**

```ts
const session = await getSession()
if (!session) return new Response('Sign in to export.', { status: 401 })
```

**`requireRole`:**

```ts
const session = await getSession()
if (!session) redirect('/login')
```

After this, `npm run act:upto -- 6` should be green, including A03 and A04 (which sign in through your endpoints).
