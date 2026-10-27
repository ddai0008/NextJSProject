# A02 · Model the CRM

> **Phase 1 · Feature · Level L1 (guided) · about 3 h**
> Needs: A01 done (Postgres running, first migration applied, data seeded).

## The ticket

**From:** Priya Nair, Data & Compliance
**Subject:** Kestrel's contacts turned up inside Acme

> Last quarter a bulk-import script attached 212 of Kestrel Solar's contacts to **Acme Freight's companies**. Nobody noticed for five
> weeks, until an Acme admin exported their company list and found people they had never met. No line of application code was
> "wrong": the script talked to the database directly, and the database accepted it.
>
> I don't want to rely on every script, import and engineer getting this right forever. **I want the database to refuse it.**
>
> While you are in there: Sales is starting to track deals next quarter (a deal has an owner, a contact, a company, a stage and a
> value), so please model those now rather than bolt them on. The data stays in one database for all customers, so the rules
> about "whose is this?" have to live in the schema.

## What you will learn

- Model a **multi-tenant** schema: a tenant column on every row, and rules that make cross-tenant references impossible *in the database*.
- Use the constraints Postgres gives you: composite keys, `CHECK`, enums, unique constraints, functional and partial unique indexes.
- Treat a generated migration as a **draft** you read and edit, and evolve a database that already holds data.
- Read a SQLSTATE: the five-character code that tells a test (and your error handling) *which* rule fired.

## Before you start

- A01 done. Run `npm run db:up` if Postgres is not running.
- Read `db/schema/*.ts` as it stands (the naive v0 from A01), and the table below.

## The mechanism: what the database can enforce, and what only code can

Application code can have bugs, and code is not the only thing that talks to your database: imports, scripts, a future service, an
engineer with `psql`. **A constraint is enforced for every writer, in every transaction, with no way to forget it.** That makes the
schema the last line of defence for the rules that must never be broken.

Try this in `npm run psql` against the A01 schema before you change anything:

```sql
insert into contacts (org_id, company_id, name)
select o.id, c.id, 'Cross-tenant test'
from orgs o, companies c
where o.slug = 'kestrel' and c.org_id = (select id from orgs where slug = 'acme')
limit 1;
-- then:  delete from contacts where name = 'Cross-tenant test';
```

It succeeds. Ask yourself: what does a foreign key *prove* about the row it points at? Is "this company exists" the same as "this company
is mine"? Your job is to find out how to make the database ask the second question.

Other ideas you will need:

- **SQLSTATE.** A failed statement carries a five-character code: `23502` not-null violation, `23503` foreign-key violation, `23505`
  unique violation, `23514` check violation, `22P02` invalid input (for example an unknown enum value). The tests assert these, because
  the code says *which kind of rule* refused the write.
- **NULL and constraints.** A nullable column is allowed to say "nothing here". What does a foreign key check for a row that has no
  value in one of its columns?
- **Case.** `Ada@Example.com` and `ada@example.com` are the same mailbox. Is a plain `UNIQUE` on the column the same thing?
- **Generated SQL is a draft.** `npm run db:generate` diffs your TypeScript against the last snapshot and writes SQL. It does not
  understand *dependencies between your statements*. You are expected to read the file before you apply it.

## The seed contract (names the seed and the tests rely on)

The seed (`scripts/lib/seed.mjs`) and the tests talk to your tables with plain SQL. Keep these names and types exactly; you decide
everything else (constraints, indexes, extra columns).

| Table | Columns the seed writes |
| --- | --- |
| `orgs` | `id` uuid, `slug` text, `name` text, `created_at` timestamptz |
| `users` | `id`, `email` text, `name` text, `created_at` |
| `memberships` | `org_id` uuid, `user_id` uuid, `role` (one of `admin`, `manager`, `rep`), `created_at` optional |
| `companies` | `id`, `org_id`, `name`, `domain` text null, `created_at` |
| `contacts` | `id`, `org_id`, `company_id` null, `owner_id` null, `name`, `email` null, `phone` null, `created_at`, `updated_at` |
| `stages` | `id`, `org_id`, `name`, `position` integer, `kind` (one of `open`, `won`, `lost`) |
| `deals` | `id`, `org_id`, `contact_id` null, `company_id` null, `owner_id`, `stage_id`, `title` text, `value_cents` bigint, `currency` text (default `'USD'`), `created_at`, `closed_at` null |

Rules for the contract: every `id` is filled in **by the database** (the seed never supplies one); any column you add beyond this table
must be nullable or have a default (otherwise the seed cannot insert); `owner_id` of a contact or a deal is a *user*.

## Requirements

1. **Nothing crosses a tenant.** A contact's company, a contact's owner, and a deal's contact, company, owner and stage must all belong
   to the same organisation as the row itself. An owner belongs to an organisation when the user has a **membership** in it.
2. **Roles.** A membership's role is `admin`, `manager` or `rep`, and nothing else.
3. **Emails.** A user's email is unique, ignoring case. A contact's email is unique **within its organisation**, ignoring case; the same
   address may exist in two organisations; any number of contacts may have no email.
4. **Slugs and stages.** An organisation's slug is unique. A stage's position is unique within its organisation. A stage's kind is
   `open`, `won` or `lost`.
5. **Money.** A deal's value is never negative.
6. **Tenant column.** `org_id` is required on every tenant table (`memberships`, `companies`, `contacts`, `stages`, `deals`).
7. **Ids.** The database generates every `id` as a time-ordered UUID (`uuidv7()`).
8. **Evolve, don't reset.** Add a *new* migration on top of A01's. It must apply to a database that already contains the A01 seed
   (`npm run db:reset` is there when you want to start clean, but a real migration cannot assume an empty database).
9. Commit the migration and its `meta/` files.

## Acceptance criteria

Run `npm run act -- 2`. The tests insert rows the database must refuse, each next to a *control* (the valid version of the same
statement), so a typo cannot pass for a constraint.

| Test | What it checks |
| --- | --- |
| A02.1 | Every table of the contract exists and the seed fills it (24 stages, 10,000+ contacts, 4,000+ deals). |
| A02.2 | A contact cannot point at a company of another organisation (`23503`). |
| A02.3 | A contact's owner must be a member of the contact's organisation (`23503`). |
| A02.4 | A deal cannot mix organisations: contact, company, owner, stage (`23503`, four cases). |
| A02.5 | A membership role must be admin, manager or rep. |
| A02.6 | Email rules: users unique ignoring case; contacts unique per organisation ignoring case; same email allowed across organisations; several contacts without an email. |
| A02.7 | Slugs unique; stage positions unique per organisation; stage kind restricted. |
| A02.8 | A deal's value cannot be negative (`23514`). |
| A02.9 | `org_id` is `NOT NULL` on every tenant table and omitting it fails (`23502`). |
| A02.10 | Ids come from the database and are uuidv7 (version nibble `7`, ordered within a statement). |

## Messages you may meet

- `there is no unique constraint matching given keys for referenced table "contacts"` (SQLSTATE `42830`): a foreign key may only
  point at columns that are guaranteed unique *together*. Postgres checks this when the foreign key is created.
- `drizzle-kit migrate` exits with status 1 and prints nothing useful. Use `npm run db:migrate`, which runs the same migrations and prints
  what Postgres said. Note: pending migrations run in **one transaction**, so a failure applies none of them.
- A test failing with `expected 'no error' to be '23503'`: the statement was **accepted**. The constraint is missing or does not cover that case.

## Stretch goals

- What should happen to a company's contacts when the company is deleted: refuse, set `company_id` to null, delete them? Choose per
  relationship and write down why. (Careful with `SET NULL` on a column that is part of a key that includes `org_id`.)
- Replace `lower(email)` unique indexes with the `citext` extension. What does it cost and gain?
- Add `ON DELETE`/`ON UPDATE` behaviour to the owner references so that removing a membership is refused while that member still owns rows.
- Explain with `EXPLAIN` why an insert into `deals` is slower with five foreign keys than with none, and whether it matters here.

## Self-review checklist

- [ ] Can I name a bug in application code (or a bad import) that the database now makes impossible?
- [ ] For each rule, can I say why it lives in the schema and not only in code?
- [ ] I read the generated SQL before applying it, and I know why the order of its statements matters.
- [ ] My migration applied on top of existing data, not just on an empty database.
- [ ] I can say what each SQLSTATE in the table above means without looking it up.
- [ ] Before running the tests I predicted which would fail.

## Official docs

- PostgreSQL constraints (check, not-null, unique, primary and foreign keys): <https://www.postgresql.org/docs/18/ddl-constraints.html>
- Indexes on expressions: <https://www.postgresql.org/docs/18/indexes-expressional.html> · partial indexes: <https://www.postgresql.org/docs/18/indexes-partial.html>
- Enumerated types: <https://www.postgresql.org/docs/18/datatype-enum.html>
- Error codes (SQLSTATE): <https://www.postgresql.org/docs/18/errcodes-appendix.html>
- UUID functions (`uuidv7()`): <https://www.postgresql.org/docs/18/functions-uuid.html>
- Drizzle: indexes and constraints <https://orm.drizzle.team/docs/indexes-constraints> · migrations <https://orm.drizzle.team/docs/migrations>

## Stuck?

Hints are in [`hints/`](hints/). Try each for 15 minutes before opening the next. `npm run solution 2` prints the reference solution; read it
**after** your own attempt.
