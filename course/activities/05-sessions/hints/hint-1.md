# A05 · Hint 1 (a nudge)

**Start from an attacker, not from code.** Write three lines: (1) "someone copies the `users` table and..."; (2) "someone copies the `sessions` table and..."; (3) "someone copies one user's cookie and...". For each, what do you
want them to be able to do? Your design is the answer to those three sentences.

**Two secrets, two storage rules.** A person's password and your server's token are not the same kind of secret. One of them can be *guessed* from a copy of the table; the other cannot. Which is which, and what does
that mean for how slow the stored form should be?

**Order of work.** Registration first (A05.1, A05.2): there is nobody to sign in until someone exists. Then login (A05.3, A05.4, A05.5), then `getSession()` and the session endpoint (A05.6), logout (A05.7), then the corner cases
(A05.8 fixation, A05.9 expiry) and finally the seam tests (A05.10 to A05.12), which are mostly about *where you put the files*.

**Where things go.** The endpoints are Route Handlers under `app/api/auth/`. The knowledge of how sessions work goes in `lib/auth/`. `lib/dal/session.ts` asks `lib/auth/` and returns a `Session`. Draw which file may import which before you write any.

**Cookies in Next.js.** `cookies()` is async. A Route Handler can set and delete cookies. Look at what the `set` options are called and what each does.

**Before you run anything:** write down how many of the 12 tests you expect to pass.
