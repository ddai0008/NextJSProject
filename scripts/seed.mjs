#!/usr/bin/env node
// npm run db:seed                 loads the full-size dataset (50k contacts) into the dev database
// npm run db:seed -- --scale test loads the smaller dataset the activity tests use
// It truncates the seeded tables first: it resets them to the known state.
import { seed } from './lib/seed.mjs'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const url = flag('--url') ?? process.env.DATABASE_URL ?? 'postgres://crm:crm@localhost:55432/crm'
const scale = flag('--scale') ?? 'full'

const started = Date.now()
try {
  const summary = await seed({ url, scale, log: (line) => console.log(`  ${line}`) })
  console.log(`Seeded (${scale}) in ${((Date.now() - started) / 1000).toFixed(1)} s:`, JSON.stringify(summary))
} catch (error) {
  console.error(String(error.message ?? error))
  process.exit(1)
}
