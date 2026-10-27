import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEEDED_ORGS, sql } from './db'

export type Route = { pattern: string; kind: 'page' | 'handler' }

/** Every page and Route Handler of a built app (read from its app-paths manifest), as URL patterns such as /[orgSlug]/contacts. */
export function discoverRoutes(appRoot: string): Route[] {
  const file = join(appRoot, '.next', 'server', 'app-paths-manifest.json')
  if (!existsSync(file)) throw new Error(`No build found at ${appRoot}: ${file} does not exist.`)
  const keys = Object.keys(JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>)
  return keys
    .filter((key) => /\/(page|route)$/.test(key))
    .map((key): Route => {
      const kind = key.endsWith('/page') ? 'page' : 'handler'
      const segments = key.replace(/\/(page|route)$/, '').split('/').filter((segment) => segment && !(segment.startsWith('(') && segment.endsWith(')')))
      return { pattern: `/${segments.join('/')}`, kind }
    })
    .filter((route) => !['/_not-found', '/_global-error', '/favicon.ico'].includes(route.pattern))
}

export type Fixture = { orgSlug: string; contactId: string }

/** Fills in the dynamic segments of a pattern with real values (and a harmless value for anything else). */
export function fill(pattern: string, fixture: Fixture): string {
  return pattern.replace(/\[\[?\.\.\.[^\]]+\]\]?|\[([^\]]+)\]/g, (_, name?: string) => (name === 'orgSlug' ? fixture.orgSlug : name === 'contactId' ? fixture.contactId : 'x'))
}

export async function fixtures(): Promise<Fixture[]> {
  return sql<Fixture>(
    `select o.slug as "orgSlug", (select c.id from contacts c where c.org_id = o.id order by c.created_at desc limit 1) as "contactId" from orgs o where o.slug = any($1) order by o.slug`,
    [SEEDED_ORGS],
  )
}

/** Email addresses of contacts in every organisation: strings that must never appear in a response to someone who is not signed in. */
export async function sensitiveStrings(): Promise<string[]> {
  const rows = await sql<{ email: string }>(
    `select email from (select email, row_number() over (partition by org_id order by created_at desc) as n from contacts where email is not null) t where n <= 10`,
  )
  return rows.map((r) => r.email)
}
