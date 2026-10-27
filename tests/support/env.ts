// What the runner (scripts/act.mjs) tells the tests. Reading a missing one gives an instruction, not a TypeError.
function required(name: string, hint: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set. ${hint} Start the tests with \`npm run act -- <n>\` (it prepares the database and the app).`)
  }
  return value
}

export const env = {
  root: () => required('ACT_ROOT', 'The runner did not start.'),
  /** The learner's own development database (what `npm run db:*` use). */
  devDbUrl: () => required('ACT_DEV_DB_URL', 'The runner did not start.'),
  /** An admin connection to this run's private copy of the test database. */
  dbUrl: () => required('ACT_DB_URL', 'There is no test database yet: do you have a migration in db/migrations (npm run db:generate)?'),
  /** What the app itself connects with (from A09 on, the restricted role). */
  appDbUrl: () => required('ACT_APP_DB_URL', 'There is no test database yet: do you have a migration in db/migrations?'),
  adminUrl: () => required('ACT_ADMIN_URL', 'The runner did not start.'),
  baseUrl: () => required('BASE_URL', 'This test needs the running app, which the runner starts for activities that declare it.'),
  baseUrlNoProxy: () => required('BASE_URL_NOPROXY', 'This test needs the app built without proxy.ts.'),
  buildLog: () => required('ACT_BUILD_LOG', 'The app was not built by the runner.'),
}
