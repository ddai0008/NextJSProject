# A02 · Hint 1 (a nudge)

**Cross-tenant references.** You tried the `insert` in `psql` and it worked, so you know what is missing. Write down, for the
foreign key `contacts.company_id → companies.id`, *exactly which facts the database compares*. Then write down which fact it would
have to compare for "this company belongs to the same organisation as this contact". Is that fact available to the foreign key?

**One rule at a time.** Make the list of rules in the Requirements into a checklist. For each, ask: which Postgres feature is *built for this*?
Rules 2, 4 and 5 are about a single column. Rule 3 is about case and about NULL. Rule 6 is one keyword per column.

**Order of work.** Change the schema for one table, run `npm run db:generate`, **open the SQL file**, read it, run
`npm run db:migrate`, run `npm run act -- 2`. Small steps keep the failing test list short. If the generator or the migration surprises you,
that is the activity working as intended.

**Calibration.** Before the first run, write down how many of the 10 tests you expect to pass. After it, look at the difference.
