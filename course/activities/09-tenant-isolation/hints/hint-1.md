# A09 · Hint 1 (a nudge)

**Write the ADR first, and write it so that someone could disagree with it.** If you cannot say how your own favourite option fails, you have not understood it yet. A useful way to find failure modes: for each option, ask *what has to stay true for it to work, and who is responsible for keeping it true?* An option that needs every author to remember something is the status quo again.

**Four options is the natural number**, but they differ in where the wall lives:

- in the application (what you have),
- in the database, on shared tables,
- in the database, one copy of the tables per tenant,
- in the database *server*, one database per tenant.

For each, work out: what does a *forgotten filter* do? What does a *migration* cost? What happens to a user who belongs to two organisations? What does the connection pool do to it?

**Who is the application, to the database?** Before you pick a mechanism, find out which role the app connects as today (`select current_user` through `npm run psql`, or read `db/config.ts`), and what that role is allowed to bypass. A wall the application can walk through is not a wall.

**The pool.** `DB_POOL_MAX` is 10 by default and 1 in the test. With one connection, what exactly is "the next request"? Whatever your design leaves on a connection, that request inherits it. List the places in your design where state could stay behind.

**Fail closed.** Decide what "nobody said which tenant this is" must produce, before deciding how a tenant is named. Write that sentence into the ADR's Decision.

**Before you run anything:** write down how many of the 8 tests you expect to pass on the first run, and which one you are least sure of. (A09.1 needs only the ADR. The others need the database and the DAL.)
