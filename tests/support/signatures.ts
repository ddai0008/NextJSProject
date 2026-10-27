import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Reads the exported functions of a module from its source (names, async or not, parameter names and type texts), so a test can
// look at EVERY function a layer offers without a list that someone has to keep up to date.

export type Parameter = { name: string; type: string }
export type FunctionSignature = { name: string; isAsync: boolean; parameters: Parameter[] }

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) => (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some((modifier) => modifier.kind === kind) ?? false

/** `export [async] function f(a: A)` and `export const f = [async] (a: A) => …`. Re-exports and classes are not looked at. */
export function exportedFunctions(file: string): FunctionSignature[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const found: FunctionSignature[] = []
  const describe = (name: string, fn: ts.FunctionLikeDeclaration): FunctionSignature => ({
    name,
    isAsync: hasModifier(fn, ts.SyntaxKind.AsyncKeyword),
    parameters: fn.parameters.map((parameter) => ({ name: parameter.name.getText(source), type: parameter.type?.getText(source) ?? '' })),
  })
  for (const statement of source.statements) {
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue
    if (ts.isFunctionDeclaration(statement) && statement.name) found.push(describe(statement.name.text, statement))
    else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer
        if (ts.isIdentifier(declaration.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) found.push(describe(declaration.name.text, init))
      }
    }
  }
  return found
}
