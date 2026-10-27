# A01 · Hint 1 (a nudge)

**Postgres won't start.** Don't guess: containers explain themselves. Run `docker compose ps -a` to see the state, then
`docker compose logs postgres`. Read the *whole* message once, slowly. It says what changed, and it names a path.

**Chromium won't start.** The message names a file it cannot find. Those files belong to operating-system packages; Playwright's
"browsers" documentation page has a section on system dependencies.

**The migration.** Two steps, in this order, and they are two different commands in `package.json`: one *writes* SQL from your
schema, one *runs* it.

**The health check.** Ask what it should do in the one situation it exists for: the database is gone. What does the code in
your handler do when `await` rejects?
