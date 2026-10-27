# A06 · CSRF and the proxy gate

> **Phase 1 · Incident · Level L2 (requirements and a given interface) · about 3 h**
> Needs: A05 done. This activity starts from code that already exists in the product: you fetch it with `npm run start-activity -- 6`.

## The ticket

**From:** Priya Nair, Data & Compliance (forwarding a report from Northgate Security, who pen-tested the beta for Kestrel Solar)
**Subject:** Pen-test findings 1 to 3, due before Kestrel goes live

> Northgate's summary, in their words:
>
> **#1 Critical.** "`GET /api/export/contacts?org=kestrel` returns the organisation's contacts as CSV to an **anonymous** request. We downloaded 5,000 rows without logging in."
> **#2 High.** "State-changing API endpoints accept requests that originate from other websites. From a page we control, we signed a victim out, and **signed a victim in as an account of ours** (login CSRF)."
> **#3 Medium.** "The application renders its internal pages to anyone who types the URL. There is no login redirect."
>
> Engineering's first reaction, which I have read in the channel: "we'll add the login redirect and that closes #1 and #3." Please don't let that be the whole fix. Last month we added a login screen to the old product and
> a different path turned out to be unprotected. I want each finding closed **in the place where the data or the change actually happens**, and the redirect to be the polite extra, not the lock.

## What you will learn

- **CSRF**: why a browser sends your cookies for a request another site caused, what `SameSite` does and does not cover, and what the `Origin` and `Sec-Fetch-Site` headers tell a server.
- Which doors Next.js closes for you (Server Actions compare `Origin` and `Host`) and which it does not (Route Handlers).
- **What `proxy.ts` is for**, and why it is an *optimistic* check: what it matches, what it skips, and how it fails when the file or its `matcher` changes.
- **Defence in depth** as a testable property: "if the outer layer disappeared, would the inner one still hold?" Your acceptance tests run against a build **without** `proxy.ts`.
- Working on code you did not write (`start-activity`), and reproducing a finding before fixing it.

## Before you start

- A05 done and `npm run act:upto -- 5` green. Your development database needs the A05 schema: `npm run db:migrate`.
- Read in your repo: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` (sections *Matcher*, *Execution order*, *Negative matching*) and `01-app/02-guides/data-security.md`
  (*Authentication and authorization*, *Built-in Server Actions security features*, *Allowed origins*).
- Skim `01-app/02-guides/server-actions.md`, the part about the CSRF check.

## Step 0: get the code you are about to fix

```bash
npm run start-activity -- 6
```

It adds one file, `app/api/export/contacts/route.ts`, written long ago by someone else "for the finance team's monthly report". Nothing else changes. Read it as you would at work: what does it trust?

## The mechanism

### CSRF in one picture

```
 victim's browser (signed in to app.example)                      evil.example
   └── has the cookie  session=...   for app.example         ──►  serves a page with  <form action="https://app.example/api/auth/logout" method="post">  + auto-submit
   └── on submit, the browser attaches the cookie anyway ─────►  app.example sees a valid session and does what it was asked
```

The server cannot tell "the user clicked Log out in my page" from "a stranger's page made the user's browser send it" by looking at the cookie: it is *identical*. What differs is **where the request came from**, and browsers state that in headers the page's script cannot forge:

| Header | Sent by | Says |
| --- | --- | --- |
| `Origin` | browsers, on cross-origin requests and on same-origin `POST`s | the scheme + host + port of the page that caused it (or the string `null`) |
| `Sec-Fetch-Site` | all current browsers | `same-origin`, `same-site`, `cross-site`, or `none` (user typed the URL) |

`SameSite=Lax` on the session cookie (A05) already stops a browser attaching it to most cross-site `POST`s. It is the first line; this activity builds the second, because `Lax` has exceptions (some top-level navigations), because `Strict` is not always acceptable, and because the *login* request carries no cookie to protect (login CSRF).

### Who does it for you?

- **Server Actions**: Next.js compares `Origin` with `Host` (or `X-Forwarded-Host`) and rejects a mismatch (configurable with `serverActions.allowedOrigins` when you sit behind a proxy). Read the guide to see exactly what.
- **Route Handlers**: **nothing**. A `POST` handler you write is a bare function. Each one must refuse requests from other sites, or be wrapped by something that does.

### What `proxy.ts` is, and is not

`proxy.ts` runs *before* the request reaches your routes, for the paths its `matcher` selects. It is the right tool for a cheap, early, user-friendly decision such as "no session cookie, so send them to /login".
It is a poor tool for *security*, for three reasons you will see in the tests:

1. **It only runs where the matcher says.** A path that the matcher skips never meets it, and the docs say that includes Server Actions posted to that path.
2. **It should be cheap**, so it usually only checks that a cookie *exists*. A forged cookie exists.
3. **It is a separate file** that a refactor can rename, narrow or delete without any test noticing, unless a test is written for exactly that.

So the rule you will enforce: every page, endpoint and action decides for itself, next to the data.

### How the tests find leaks

The acceptance tests start two copies of your app: your build, and a build of a copy of your project **without `proxy.ts`**. A route walker reads each build's own list of pages and endpoints, requests every one as a visitor with no cookie and as one with a
forged cookie, for every organisation and with the organisation in the query string too, and looks for customer data (contact email addresses) in the answers. You will not have to name the routes: if a future activity adds one, the walker finds it.

## Do this first: two experiments (about 20 minutes)

Write `docs/notes/a06-predictions.md` with your guesses **before** you run anything, then the observations.

1. **Reproduce #1.** Run `npm run dev`, then, with no cookie: `curl -s 'http://localhost:3000/api/export/contacts?org=kestrel' | head -5`. What do you get? (This is the finding, running on your machine.)
2. **Reproduce #2** by hand, from the command line, playing "another site": `curl -si -X POST localhost:3000/api/auth/logout -H 'Origin: https://evil.example' -H 'Cookie: session=<a real cookie value>'`. What status, and is the session gone? Now think about what a *browser* adds to such a request that `curl` does not.
3. **What does the proxy see?** Once you have a `proxy.ts`, add `console.log(request.method, request.nextUrl.pathname, request.headers.get('next-action') ? '(Server Action)' : '')` to it. In `npm run dev`, sign in, open a contacts list and use the **Add contact** form. Which requests appear in the terminal?
   Then change the `matcher` so that it excludes your organisation's path (for example `lumen`), repeat, and **predict first**: does the Server Action still run? Does the proxy see it? What, in your code, is then the only thing standing between a stranger and that action?

## Requirements

1. **#1: the export endpoint.** A request with no valid session gets **401** and no data. A signed-in user still gets the CSV (status 200, `text/csv`, first line `name,email,company`). Check inside the handler, next to the query.
   (Who may export *which* organisation is a different question, and A07/A08 are about it. For now: signed in.)
2. **#2: cross-site requests.** The `POST` endpoints under `/api/auth/` (register, login, logout) refuse a request from another site with **403** and have no effect. Your policy:
   - an `Origin` header that is not this site's own is refused (including `null`, and values that merely *contain* this site's address);
   - with no `Origin`, a `Sec-Fetch-Site` of `cross-site` or `same-site` is refused;
   - with neither header the request did not come from a browser, so it is let through (CSRF needs a browser);
   - the check is a shared helper that every state-changing handler calls first, and **it works in the build without `proxy.ts`**.
3. **#3: the login gate.** Create `proxy.ts`. A visitor with no session cookie who asks for an organisation's page is redirected (HTTP redirect, 3xx) to `/login`. `/`, `/login`, `/register`, static files and the auth endpoints are not caught by the gate.
4. **`requireRole` requires a session.** Make the stub in `lib/dal/session.ts` send a visitor who is not signed in to `/login` (it still treats any signed-in user as an admin of any organisation: that is A07's job). After this, no page or action returns data without a valid session even if `proxy.ts` is gone.
5. **The experiments**, with `docs/notes/a06-predictions.md`.

## Acceptance criteria

Run `npm run act -- 6`. It builds your app twice (once without `proxy.ts`), which takes about a minute. The CSRF and leak groups run against **both** builds.

| Test | What it checks |
| --- | --- |
| A06.1 | A cross-site `POST` to logout is refused (403) and the session survives. |
| A06.1b | Origins that merely *contain* this site's address (`…:PORT.evil.example`, `…@evil.example`, …) are refused too. |
| A06.2 | A cross-site `POST` to login or register is refused and has no effect (no user created, no cookie issued). |
| A06.3 | The same site is let through, and so is a request with no browser headers at all. |
| A06.4 | `Origin: null` and `Sec-Fetch-Site: cross-site` / `same-site` (without an Origin) are refused. |
| A06.5 | A visitor with no cookie is redirected to `/login` from the organisation pages (an HTTP redirect). |
| A06.6 | `/`, `/login` and `/register` stay public; a signed-in visitor gets the organisation page. |
| A06.7 | Static assets and the auth/health endpoints are not caught by the gate. |
| A06.8 | The export endpoint is in your project (you ran `start-activity`). |
| A06.9 | A signed-in user can still export (the fix did not just switch it off). |
| A06.10 | The probe works: a signed-in member does receive the strings the walker looks for. |
| A06.11 | **No page and no endpoint hands customer data to a visitor with no session or a forged one, in the build with `proxy.ts` and in the build without it.** |

## Messages you may meet

- `expected 204 to be 403` on a CSRF test: the request from another site was accepted.
- The walker's failure lists what leaked, in the form
  `handler /api/export/contacts as kestrel (no cookie): HTTP 200, leaked 10 strings, e.g. …@example.test`. Read which *route*, *organisation* and *credential* (none or forged); then ask which layer should have said no.
- If you name the file `middleware.ts`: `The "middleware" file convention is deprecated. Please use "proxy" instead.`
- A failure only in the **"without proxy.ts"** groups means a check you believe is in your code is actually in `proxy.ts` (or in its `matcher`).

## Stretch goals

- Make the proxy validate the cookie against the database instead of only checking that it exists. What does that cost on *every* request, and why did the docs recommend against it?
- Add a `next` parameter so that after signing in the visitor lands where they were going. Prevent an **open redirect** (`/login?next=https://evil.example`).
- Require `Content-Type: application/json` on the JSON endpoints. Does a cross-site `<form>` post JSON? What does that buy you, and why is it *not* a replacement for the Origin check?
- CORS is not CSRF protection. Explain, in three sentences, what CORS stops and what it does not. (Hint: what happens to a request that does not need a preflight?)
- Replace the per-handler call with a wrapper `withSameOrigin(handler)` so a new handler cannot forget it.
- Configure `serverActions.allowedOrigins` and describe the situation in which you need it.

## Self-review checklist

- [ ] For finding #1, I can point to the line that stops an anonymous request, and it is in the handler.
- [ ] If `proxy.ts` were deleted tonight, which of my guarantees would change? (Answer: only the redirect.)
- [ ] I can explain why a forged cookie passes the proxy, and what stops it from reading data.
- [ ] I know what `SameSite=Lax` covers and what the Origin check adds.
- [ ] My Origin check parses the header; it does not search it for a substring.
- [ ] I know which of my entry points are Server Actions (checked by Next.js) and which are Route Handlers (checked by me).
- [ ] I wrote my predictions before running the experiments, and a sentence for each wrong one.

## Official docs

- Next.js (in your repo): `01-app/03-api-reference/03-file-conventions/proxy.md`; `01-app/02-guides/data-security.md`; `01-app/02-guides/server-actions.md`; `01-app/02-guides/backend-for-frontend.md` (*Security*)
- MDN: `Origin` <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin> · `Sec-Fetch-Site` <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site> · `SameSite` in `Set-Cookie`
- OWASP: Cross-Site Request Forgery Prevention Cheat Sheet <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>

## Stuck?

Hints are in [`hints/`](hints/). `npm run solution 6` prints the reference solution; read it **after** your own attempt.
