# A05 · Sessions from first principles

> **Phase 1 · Feature · Level L2 (requirements and a given interface) · about 5 h**
> Needs: A04 done. No auth library: the point is to build it once by hand.

## The ticket

**From:** Jun Park, CTO
**Subject:** Acme's security questionnaire

> Acme Freight's procurement team sent us a security questionnaire, and three questions have no answer today because **there is no login**:
>
> 1. "How are user passwords stored? What does an attacker get from a copy of your database?"
> 2. "How do sessions end? Can you end one on demand?"
> 3. "How do you stop a hostile page from riding a signed-in user's browser?" (that one is next sprint, but your answer to 2 decides how hard it will be)
>
> Right now every page trusts the URL (`requireRole` is a stub). Before anything else can be built on "who is signed in", we need real accounts and
> sessions, and I want them **behind two functions** so that the day we adopt a library (A10) nothing that *uses* sessions has to change.
>
> I want you to build it by hand, without a library, **once**: whoever later adopts one will then know exactly what it is doing for us, and what to check when it is configured wrongly.

## What you will learn

- A **threat model for credentials**: what a copy of the database, a copy of a cookie, a hostile script, and a patient guesser each get you. Passwords and session tokens are different secrets and are protected differently.
- Password storage: why a fast hash is the wrong tool, what a **salt** is for, what "memory-hard" buys.
- Session design: an **opaque random token** and a **server-side row**, what the cookie flags defend, **fixation**, expiry, **revocation**.
- Where cookies can be set in the App Router, and why reading one makes a page *runtime data* (A03 again).
- Designing a **seam**: the rest of the app calls two functions and nothing else.

## Before you start

- A04 done. Your development database needs the A04 schema: `npm run db:migrate`.
- Look at `components/auth-form.tsx` (given) and `app/login`, `app/register`: the pages already exist and call the endpoints you build.
- Look at `lib/dal/session.ts`: `getSession()` is a stub returning `null`. Making it real is half of this activity.
- Skim `node_modules/next/dist/docs/01-app/02-guides/authentication.md` (the sections *Session Management*, *Database Sessions*) and `…/03-api-reference/04-functions/cookies.md`.

## The mechanism

### Two different secrets

| | Password | Session token |
| --- | --- | --- |
| Chosen by | a person (low entropy, reused elsewhere) | your server (256 random bits) |
| An attacker with a copy of the table | will **guess** offline, billions of times | cannot guess; can only **use** a token they hold |
| So the stored form must be | deliberately **slow and memory-hungry**, with a **per-user salt** | anything one-way; speed does not matter because there is nothing to guess |

A "fast" hash is the right tool for the second and the wrong one for the first. A **salt** is a random value stored with each hash so that two users with the same password have different stored values and one precomputed table cannot attack everyone.

### A session is a random secret plus a row

```
 login:   check the password ──► make 32 random bytes ──► INSERT a row (what to store? think) ──► Set-Cookie: <token>
 request: Cookie: <token> ──► look the row up ──► expired? ──► who is it? ──► getSession() = { userId, email } | null
 logout:  DELETE the row ──► clear the cookie
```

- A cookie is a request header the **browser** sends; the client can send anything. The only thing that makes a value mean "signed in" is that your database knows it.
- **Revocation** (question 2) means the server can say no to a token it once accepted. What is stored, and where, decides whether that is possible.
- The cookie flags each stop one thing: `HttpOnly`, `Secure`, `SameSite`, `Path`, `Max-Age`. Find out which, and what happens without each.
- **Fixation.** What if an attacker gets *their* token into your victim's browser before login, and the server keeps it afterwards?
- **Enumeration.** If "no such user" and "wrong password" differ in the message, the status, or the *time they take*, the endpoint tells a stranger which emails are customers.

### Where this runs in Next.js

- Register, login and logout are **Route Handlers** that return JSON; the pages already post to them. A handler can set cookies through `cookies()`; a Server Component *render* cannot.
- `cookies()` is **runtime data** (A03): a component that reads it needs the request, so it belongs behind `<Suspense>`. `getSession()` reads it.
- `GET /api/auth/session` answers "who am I?" by calling `getSession()`, like every other caller will.

### The seam

`lib/dal/session.ts` exports `getSession()` and `requireRole()`. Everything else in the app asks about the signed-in user through those two, and nothing else knows *how* sessions work (cookie name, table, hashing). The details live in `lib/auth/`, which only the DAL and the auth endpoints under `app/api/auth/` may import.
A test enforces this; A10 will replace the inside and A05–A09 will still have to pass.

## Requirements

1. **Endpoints** (JSON in, JSON out):
   - `POST /api/auth/register` with `{ email, name, password }`: **201** `{ id }`. **400** for a malformed email, an empty name, a password shorter than 10 or longer than 200 characters, a missing field or a body that is not JSON.
     **409** if the email is already registered (compared ignoring case). Emails are stored as given but compared case-insensitively.
   - `POST /api/auth/login` with `{ email, password }`: **200** `{ userId }` and a session cookie. Otherwise **401** with **one** message for "no such user" and "wrong password", identical in status and body, and no cookie. (The cost should not differ either.)
   - `POST /api/auth/logout`: **204**; the cookie is cleared **and** the session ends on the server.
   - `GET /api/auth/session`: **200** `{ userId, email }` for a valid session, **401** otherwise. It calls `getSession()`.
2. **Passwords.** Stored hashed with a function designed for passwords, with a per-user salt. The plaintext is stored nowhere. Nothing stored may be a bare MD5/SHA digest of the password.
   Put the hash in `users.password_hash` (a new nullable column; the seed's people have none and cannot sign in).
3. **Sessions.** A random token of at least 128 bits in the cookie; **only a hash of it** in the database. A session lives `SESSION_TTL_SECONDS` seconds (default 7 days); the cookie's `Max-Age` says the same,
   and the server refuses an expired session even if the client still sends the cookie. Logging in again creates a new session and leaves the user's other sessions alone. A cookie value sent by the client at login is **never adopted**.
4. **Cookie.** `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict`), `Path=/`, with an expiry. (The tests run the production build, which is why `Secure` is expected.)
5. **The seam.** `getSession()` in `lib/dal/session.ts` is real: it reads the cookie and returns `{ userId, email }` or `null`. Session internals live under `lib/auth/`. Nothing outside `lib/dal/`, `lib/auth/` and `app/api/auth/` imports from `lib/auth/`.
6. A new migration: `users.password_hash` and a table for sessions (you decide its columns). Commit it.

## Acceptance criteria

Run `npm run act -- 5`. Earlier activities' tests now sign in through your endpoints when they can, so run `npm run act:upto -- 5` at the end: it proves nothing before this broke.

| Test | What it checks |
| --- | --- |
| A05.1 | Registration: 201 with an id; 400 for bad input (including a 100,000-character password); 409 for a duplicate in any case. |
| A05.2 | The password is stored nowhere in the clear; what is stored is neither a fast digest nor the same for two users with the same password. |
| A05.3 | Login: 200 with a cookie; a wrong password and an unknown email give the same status and body, no cookie; email is case-insensitive. |
| A05.4 | The cookie: `HttpOnly`, `Secure`, `SameSite`, `Path=/`, an expiry, 128+ bits, different on every login. |
| A05.5 | The raw token appears in no column of any table (and the cookie still works). |
| A05.6 | `GET /api/auth/session`: 200 with identity for a valid cookie; 401 for none, a wrong or a forged one. |
| A05.7 | Logout: 204, cookie cleared, the session is dead on the server, the user's other session survives. |
| A05.8 | A cookie the client offered at login is not adopted (fixation). |
| A05.9 | With `SESSION_TTL_SECONDS=2` the session works at once and is refused after 3 seconds; `Max-Age` follows the setting. |
| A05.10 | `lib/dal/session.ts` exports `getSession` and `requireRole`. |
| A05.11 | Nothing outside `lib/dal`, `lib/auth` and `app/api/auth` imports from `lib/auth`. |
| A05.12 | The session endpoint imports `getSession` from `lib/dal/session`, not from `lib/auth`. |

## Messages you may meet

- With `node:crypto`'s scrypt at a realistic cost: `ERR_CRYPTO_INVALID_SCRYPT_PARAMS: Invalid scrypt params: error:030000AC:digital envelope routines::memory limit exceeded`
  (the default memory cap is 32 MiB; verified on Node 24).
- A test failing with `columns holding the raw token: expected [ 'sessions.token_hash' ] to deeply equal []`: what you store is the token itself, or something that contains it.
- A test failing with `values stored identically for two users with the same password (unsalted)`: the stored value does not depend on a per-user random value.
- `Cookies can only be modified in a Server Action or Route Handler`: you tried to set a cookie while rendering.

## Stretch goals

- **Measure it.** Time 20 logins with a wrong password and 20 with an unknown email, take the medians. If they are far apart, you have built an enumeration oracle. What did you add (or forget) to close it? (There is no test for this on purpose: tests assert behaviour, not clocks. You are the test.)
- Use `__Host-` as a prefix for the cookie name. What must be true for a browser to accept it, and what does it stop? Why can't you test it on `http://localhost`?
- Sliding expiry: extend a session on use, but at most once a minute so reads don't turn into writes.
- Limit a user to N concurrent sessions, and add "sign out everywhere".
- Replace the password hash function with the other family (scrypt ↔ argon2id) and make `verifyPassword` accept **both** formats, so existing users keep working while new hashes use the new function. (This is what A10 will need.)

## Self-review checklist

- [ ] I can say what an attacker holding a copy of the `sessions` table gets, and what one holding a copy of the `users` table gets.
- [ ] I can say why the session token can use a fast hash while the password cannot.
- [ ] For each cookie flag I can name the attack it addresses and what breaks without it.
- [ ] "No such user" and "wrong password" cost the same time in my implementation (I measured, or I can explain how I made sure).
- [ ] Logging out ends the session on the server. I can prove it with a copied cookie.
- [ ] Nothing in `app/` or `components/` knows the cookie's name.
- [ ] Before the first run I wrote down how many of the 12 tests I expected to pass.

## Official docs

- Next.js (in your repo): `01-app/02-guides/authentication.md` (Session Management, Database Sessions); `03-api-reference/04-functions/cookies.md`; `03-api-reference/03-file-conventions/route.md`
- Node.js `crypto`: <https://nodejs.org/api/crypto.html> (`scrypt`, `randomBytes`, `timingSafeEqual`, `createHash`)
- OWASP Password Storage Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html> · Session Management Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>
- MDN `Set-Cookie`: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie>

## Stuck?

Hints are in [`hints/`](hints/). `npm run solution 5` prints the reference solution; read it **after** your own attempt.
