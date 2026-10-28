# A09 · Hint 2 (narrows the approach)

This hint assumes your ADR chose **row-level security on the shared tables**; if you chose another strategy, the questions are the same and the mechanism is yours.

**The role.** A migration (`npx drizzle-kit generate --custom --name=tenant_isolation` creates an empty one you fill with SQL, like the `pg_trgm` line in A02) creates `crm_app` with `LOGIN PASSWORD 'crm_app'`, and no superuser, no `BYPASSRLS`. Roles are cluster-wide, so `CREATE ROLE` fails if it already exists: guard it, and say the attributes again afterwards. Give it `USAGE` on the schema and `SELECT, INSERT, UPDATE, DELETE` on the tables (and think about tables you will add later: `ALTER DEFAULT PRIVILEGES`).

**The policy.** For each tenant table: `ENABLE ROW LEVEL SECURITY`, then a policy whose condition compares the row's `org_id` with a setting, read with `current_setting('app.org_id', true)` (the `true` means "return NULL instead of an error when it was never set"). Two details that the spike for this activity measured: after a transaction-local setting has been used on a connection, `current_setting` answers an **empty string** there (not NULL), and `''::uuid` is an error, so decide how the policy should treat the empty string. And a policy written with only `USING` also governs inserts and updates: you do not need a second clause to stop a write for another tenant.

**Naming the tenant.** `select set_config('app.org_id', $1, true)`: the third argument decides whether the setting lives for the session or for the transaction. Which one do you want, and what does the other one do to the next request? Put the call, and the transaction it belongs to, in **one** place (`db/client.ts` is the owner of the pool) and have the DAL use that, instead of repeating it in each function.

**Using it in the DAL.** Every statement that touches `contacts`, `companies`, `deals` or `stages` must run on the connection that has the setting. In Drizzle that means the `tx` handed to you by `db.transaction`, not `db`. Careful with one thing: if a DAL function calls *another* DAL function from inside its own transaction, the inner one asks the pool for a second connection. With a pool of one it waits for the first, and the first waits for it. (Call them one after the other.)

**Who is not covered?** `orgs`, `memberships`, `users` and `sessions` are how a request *finds out* its tenant. Think about why they cannot sit behind the same policy, and write the consequence down.

**The plan.** Run the A03 search through `EXPLAIN` twice: as the owner, and as `crm_app` with the setting on. Compare. If they differ, ask Postgres why: it will not evaluate a function ahead of a policy filter unless the function is *leakproof* (`select proname, proleakproof from pg_proc where proname = 'texticlike'`). Your options, none of them free:

- accept what the planner does: the policy uses the `org_id` index and the search is applied to that tenant's rows. How slow does that get? Measure it: load one tenant with 10k, 50k, 100k contacts and time a search that matches nothing;
- a different isolation strategy, whose indexes the policy does not hide;
- a function that runs with its owner's rights and does the search itself: what does the policy do inside it?
- mark the function leakproof. Before you take that one, read what the manual says leakproof promises, then **run the probe of A09.6 against the plan it produces**. A promise about error messages is only as good as the weakest input anyone can send.

The ADR is the place to say which you took and what you measured.

**Run the tests as you go:** `npm run act -- 9 -t A09.2`, then `A09.3`, and so on. After A09.4 passes, run `npm run act:upto -- 9`: the earlier DAL tests now run as `crm_app`, so a function that forgot the wrapper shows up as an empty result.
