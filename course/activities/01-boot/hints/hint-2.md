# A01 · Hint 2 (narrows the approach)

**Postgres.** The log says images from version 18 keep their data in a *major-version-specific directory*, and that your mount
at `/var/lib/postgresql/data` is "unused". Look at the "PGDATA" section of the `postgres` image page on Docker Hub: where does
the 18 image put the cluster, and therefore which directory is the *parent* that a volume should cover? Edit the `volumes:` line
in `compose.yaml` accordingly. You do **not** need `docker compose down -v` first; the failed container held no data.

**Chromium.** First `npx playwright install chromium` (it downloads the browser). Then install the system libraries once:
`sudo apt install libnspr4 libnss3 libasound2t64`. The course author checked that these three are what a fresh Ubuntu 26.04
under WSL is missing. (`sudo npx playwright install-deps chromium` is the official shortcut; the author could not run it to check.)

**The route.** A Route Handler is a file exporting functions named after HTTP methods. Use the shared Drizzle client from
`db/client.ts` (it is `server-only`, so it can only run on the server). `show server_version` is plain SQL; Drizzle's `sql`
template and `db.execute` run it. For the error path you need `try`/`catch`, the `status` option of `Response.json`, and a
`console.error` that is *not* part of the response.

**Not stale.** Reading the database on every request already makes the handler dynamic (the build output marks it `ƒ`).
`Cache-Control: no-store` on the response also tells any proxy in between not to keep it.
