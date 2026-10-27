// The schema. A01 ships a deliberately naive v0 (just enough to seed 10k+ contacts); A02 is where you design the real one.
// drizzle-kit reads this file: every table must be exported from here.
export * from './orgs'
export * from './users'
export * from './companies'
export * from './contacts'
