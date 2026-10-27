import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, test } from 'vitest'
import { env } from '../../support/env'
import { hasUseClientDirective, importsMatching, moduleSpecifiers, resolveSpecifier, sourceFiles } from '../../support/imports'

// How the code is organised, because the organisation is what keeps the rules in one place:
// the data access layer is server-only, client code never reaches it, and pages, layouts, actions and components never talk to the database directly.

describe('A07 the boundary', () => {
  test('A07.11 every module of lib/dal imports server-only', () => {
    const files = sourceFiles(['lib/dal']).filter((f) => !/\/types\.ts$|\/errors\.ts$/.test(f))
    expect(files.length).toBeGreaterThan(3)
    const missing = files.filter((file) => !/import\s+['"]server-only['"]/.test(readFileSync(file, 'utf8'))).map((f) => relative(env.root(), f))
    expect(missing, 'modules without `import "server-only"`').toEqual([])
  })

  test('A07.12 no Client Component imports the data access layer, the database or auth internals', () => {
    const clients = sourceFiles(['app', 'components']).filter(hasUseClientDirective)
    expect(clients.length, 'client components found').toBeGreaterThan(0)
    const bad: string[] = []
    for (const file of clients) {
      for (const specifier of moduleSpecifiers(file)) {
        const resolved = resolveSpecifier(file, specifier)
        if (resolved && /^(lib\/dal|lib\/auth|db)(\/|$)/.test(resolved)) bad.push(`${relative(env.root(), file)} imports ${specifier}`)
      }
    }
    expect(bad).toEqual([])
  })

  test('A07.13 pages, layouts, actions and components never import the database; they ask the data access layer', () => {
    const hits = importsMatching(['app', 'components'], (resolved) => /^db(\/|$)/.test(resolved)).filter(
      // Route Handlers are not pages: the auth endpoints and the health check may talk to the database layer they belong to.
      ({ file }) => /(^|\/)(page|layout|loading|error|not-found|actions)\.tsx?$/.test(file) || file.startsWith('components/'),
    )
    expect(hits.map((h) => `${h.file} imports ${h.specifier}`), 'ask lib/dal instead').toEqual([])
  })

  test('A07.14 getSession and requireRole are still the only door: nothing but lib/dal and the auth endpoints imports lib/auth', () => {
    const violations = importsMatching(['app', 'components', 'lib', 'db'], (resolved) => resolved === 'lib/auth' || resolved.startsWith('lib/auth/')).filter(
      ({ file }) => !/^(lib\/dal\/|lib\/auth\/|app\/api\/auth\/)/.test(file),
    )
    expect(violations.map((v) => `${v.file} imports ${v.specifier}`)).toEqual([])
    expect(readFileSync(join(env.root(), 'lib', 'dal', 'session.ts'), 'utf8')).toMatch(/export\s+(async\s+)?function\s+requireRole/)
  })
})
