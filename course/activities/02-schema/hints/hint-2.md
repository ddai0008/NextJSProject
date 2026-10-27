# A02 · Hint 2 (narrows the approach)

**The big one.** A foreign key may involve **more than one column**. If the referencing table and the referenced table both carry the
organisation, you can make the key say "this `(org_id, company_id)` pair must exist as an `(org_id, id)` pair over there". For that to be
legal, the pair on the referenced side has to be unique *as a pair* (Postgres tells you if it is not: see "Messages you may meet").
Think about whether adding that uniqueness costs you anything real, given `id` is already unique on its own.

**"Owner is a member."** The same trick, pointing at a table whose key is the pair `(org_id, user_id)`. Which table is that?

**NULL.** For a foreign key over `(org_id, company_id)` where `company_id` may be NULL, read what the Postgres docs call `MATCH SIMPLE`
(the default). That is exactly the behaviour the contacts-without-a-company need, and the reason the seed can leave some companies empty.

**Case-insensitive unique.** A unique **index** can be built over an *expression*. For contacts, the uniqueness is per organisation, and
rows without an email must not collide with each other: look at partial indexes (an index with a `WHERE`). In Drizzle:
`uniqueIndex(...).on(...).where(...)`, with `sql` for the expression.

**Roles and kinds.** A Postgres enum (`pgEnum` in Drizzle) is one option; a `CHECK` over a text column is another. The tests accept either for roles.

**The migration.** After `db:generate`, find the `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` lines and the `ADD CONSTRAINT ... UNIQUE` lines they depend
on. Which one must run first? The generator did not promise to get that right.
