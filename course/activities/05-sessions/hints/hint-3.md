# A05 · Hint 3 (close to code)

The reference solution is `npm run solution 5`. These are the parts most worth seeing.

**Password hashing with `node:crypto` (scrypt):**

```ts
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { promisify } from 'node:util'
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: ScryptOptions) => Promise<Buffer>
const COST = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }   // maxmem: the default cap (32 MiB) is too small for this N

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, 64, COST)
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join('$')
}
// verifyPassword: split the string, recompute with the STORED parameters, timingSafeEqual
```

**A session, in outline:**

```ts
const token = randomBytes(32).toString('base64url')                       // 256 bits: the cookie value
const tokenHash = createHash('sha256').update(token).digest('hex')        // what goes in the table
// insert { userId, tokenHash, expiresAt: new Date(Date.now() + ttlSeconds * 1000) }
// lookup: where token_hash = sha256(cookie) and expires_at > now()
```

**Setting the cookie in a Route Handler:**

```ts
const jar = await cookies()
jar.set('session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: ttlSeconds() })
return Response.json({ userId })
// logout: await deleteSession(token); jar.delete('session'); return new Response(null, { status: 204 })
```

**The login handler's shape** (unknown email and wrong password end in the same place):

```ts
const user = await findUserByEmail(email)
if (!user?.passwordHash) { await spendAsMuchTimeAsAPasswordCheck(); return REFUSED }     // same response...
if (!(await verifyPassword(password, user.passwordHash))) return REFUSED                  // ...as this
```

For `spendAsMuchTimeAsAPasswordCheck`, verify the supplied password against a hash you computed once for a throwaway password.

**Schema:** `users.password_hash text` (nullable) and a `sessions` table: `id`, `user_id` (references `users`, delete cascade), `token_hash text unique not null`, `created_at`, `expires_at timestamptz not null`.
Generate the migration and **read it** before applying (A02 taught you why).
