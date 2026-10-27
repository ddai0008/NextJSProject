import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { env } from '../../support/env'
import { importsMatching } from '../../support/imports'

// The seam: the rest of the app asks "who is this?" through two functions exported from lib/dal/session.ts, and through nothing else.
// Everything that knows HOW sessions work lives in lib/auth/ and is reached only from the DAL and from the auth endpoints themselves.

const MAY_IMPORT_AUTH = [/^lib\/dal\//, /^lib\/auth\//, /^app\/api\/auth\//]

describe('A05 the seam', () => {
  test('A05.10 lib/dal/session.ts exports getSession and requireRole', () => {
    const source = readFileSync(join(env.root(), 'lib', 'dal', 'session.ts'), 'utf8')
    expect(source).toMatch(/export\s+(async\s+)?function\s+getSession\b|export\s+const\s+getSession\b/)
    expect(source).toMatch(/export\s+(async\s+)?function\s+requireRole\b|export\s+const\s+requireRole\b/)
  })

  test('A05.11 nothing outside lib/dal, lib/auth and app/api/auth imports from lib/auth', () => {
    const violations = importsMatching(['app', 'components', 'lib', 'db'], (resolved) => resolved === 'lib/auth' || resolved.startsWith('lib/auth/')).filter(
      ({ file }) => !MAY_IMPORT_AUTH.some((allowed) => allowed.test(file)),
    )
    expect(violations.map((v) => `${v.file} imports ${v.specifier}`), 'ask for the session through lib/dal/session').toEqual([])
  })

  test('A05.12 the session endpoint is itself a caller of the seam: it imports getSession from lib/dal/session, not from lib/auth', () => {
    const file = join(env.root(), 'app', 'api', 'auth', 'session', 'route.ts')
    const source = readFileSync(file, 'utf8')
    expect(source).toMatch(/from\s+['"]@\/lib\/dal\/session['"]/)
    expect(source).not.toMatch(/from\s+['"]@\/lib\/auth/)
  })
})
