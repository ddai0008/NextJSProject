// Where the database is. Everything (the app, drizzle-kit, the seed, the tests) reads it from here or from the environment.
//
//   DATABASE_URL            what the running app connects with (from A09 on: the restricted `crm_app` role)
//   MIGRATION_DATABASE_URL  what migrations connect with (defaults to DATABASE_URL)
export const DEFAULT_DATABASE_URL = 'postgres://crm:crm@localhost:55432/crm'

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL
}

export function migrationDatabaseUrl(): string {
  return process.env.MIGRATION_DATABASE_URL ?? databaseUrl()
}
