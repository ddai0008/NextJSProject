import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { env } from './env'

// A tiny import-graph scanner for the few tests that check how the code is organised (the auth seam, the DAL boundary).

const SKIP = new Set(['node_modules', '.next', '.act', '.git', 'tests', 'course'])

export function sourceFiles(dirs: string[], root: string = env.root()): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
      if (SKIP.has(entry)) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(ts|tsx|mts|js|jsx|mjs)$/.test(entry)) out.push(full)
    }
  }
  for (const dir of dirs) walk(join(root, dir))
  return out
}

export function moduleSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const found: string[] = []
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      // `import type` is erased at build time and cannot reach runtime code, so it does not count.
      const typeOnly = ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly : node.isTypeOnly
      if (!typeOnly) found.push(node.moduleSpecifier.text)
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      found.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/** Repo-relative path (without extension) a specifier points at, or null for packages and anything outside the repo. */
export function resolveSpecifier(fromFile: string, specifier: string, root: string = env.root()): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = join(root, specifier.slice(2))
  else if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier)
  else return null
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return relative(root, candidate).replace(/\.(ts|tsx|mts|js|jsx|mjs)$/, '')
  }
  return relative(root, base)
}

export type Import = { file: string; specifier: string; resolved: string }

/** Every runtime import in `scanDirs` whose target satisfies `isTarget`. */
export function importsMatching(scanDirs: string[], isTarget: (resolved: string) => boolean, root: string = env.root()): Import[] {
  const hits: Import[] = []
  for (const file of sourceFiles(scanDirs, root)) {
    for (const specifier of moduleSpecifiers(file)) {
      const resolved = resolveSpecifier(file, specifier, root)
      if (resolved && isTarget(resolved)) hits.push({ file: relative(root, file), specifier, resolved })
    }
  }
  return hits
}

export const hasUseClientDirective = (file: string) => /^\s*(['"])use client\1/.test(readFileSync(file, 'utf8').replace(/^(\s*\/\/.*\n|\s*\/\*[\s\S]*?\*\/\s*)*/, ''))
