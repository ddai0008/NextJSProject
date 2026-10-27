# A01 · Hint 3 (close to code)

This is as close as hints get; the solution is `npm run solution 1`.

**Postgres.** In `compose.yaml` the volume line should end at the parent of the version directory:

```yaml
    volumes:
      - pgdata:/var/lib/postgresql
```

then `npm run db:up`.

**Commands, in order.**

```bash
npm run db:generate     # writes db/migrations/0000_<name>.sql and db/migrations/meta/*
npm run db:migrate      # applies it to the dev database "crm"
npm run db:seed         # 50,000 contacts; takes a couple of seconds
npm run psql            # then:  \dt   select count(*) from contacts;   \q
```

**Route handler, in outline.**

```ts
import { sql } from 'drizzle-orm'
import { db } from '@/db/client'

export async function GET() {
  const checkedAt = new Date().toISOString()
  try {
    const { rows } = await db.execute<{ server_version: string }>(sql`show server_version`)
    return Response.json({ status: 'ok', database: 'up', serverVersion: rows[0].server_version, checkedAt }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('health check failed', error)
    // return a 503 with { status: 'error', database: 'down', checkedAt } and the same header
  }
}
```

Complete the `catch` yourself, then run `npm run act -- 1`.
