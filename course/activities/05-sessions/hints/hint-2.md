# A05 · Hint 2 (narrows the approach)

**Passwords.** Use a password-hashing function: **scrypt** (built into `node:crypto`, no dependency) or **argon2id** (`@node-rs/argon2`). Generate 16 random bytes of salt per user and store the algorithm, its cost
parameters, the salt and the hash together in one string, so you can raise the cost later and still verify old hashes. Compare with a constant-time comparison. Cap the password length before hashing: hashing is deliberately expensive,
so an unbounded password is a cheap way to burn your CPU. With `node:crypto`'s scrypt at N=2^15 you will hit its default memory cap: read the error.

**Unknown email.** If you return early when the email is unknown, that request takes a few milliseconds and the wrong-password one takes a hundred: an observer can tell customers from strangers by the clock. What could the unknown-email branch do so both branches cost about the same?

**Tokens.** `crypto.randomBytes(32)`, encoded as base64url, is the token and the cookie value. The database gets `sha256(token)` only. Looking a session up is `WHERE token_hash = sha256(cookie) AND expires_at > now()`.
Why is a fast hash fine *here*?

**Fixation.** The simplest defence is not to read the incoming cookie at all in the login handler: always generate a new token.

**Logout.** Two things must happen: delete the row, and clear the cookie. Which of them makes a copied cookie useless?

**Lifetime.** Read `SESSION_TTL_SECONDS` when you create a session (not once at start-up), and use the same number for the row's expiry and the cookie's `Max-Age`.

**`getSession()`.** `(await cookies()).get(NAME)?.value` → look the row up → `{ userId, email }` or `null`. Because it reads cookies it must be called inside `<Suspense>` from a page; from a Route Handler it needs nothing special.

**The seam.** `app/api/auth/session/route.ts` imports `getSession` from `@/lib/dal/session`. `lib/dal/session.ts` imports from `@/lib/auth/...`. Nothing else does.
