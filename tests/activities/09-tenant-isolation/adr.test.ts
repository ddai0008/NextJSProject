import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { env } from '../../support/env'

// This test checks the SHAPE of your decision record, not whether the decision is good. A shape check cannot judge reasoning; what it can do is stop a record
// that never weighed an alternative or never said how its own choice fails. The reasoning is yours; the checklist in ACTIVITY.md is how you judge it.

type Section = { title: string; body: string; children: Section[] }

/** Splits a Markdown document into its `##` sections, each with its `###` subsections. */
function sections(markdown: string): Section[] {
  const out: Section[] = []
  let current: Section | null = null
  let sub: Section | null = null
  for (const line of markdown.split('\n')) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line)
    const h3 = /^###\s+(.+?)\s*$/.exec(line)
    if (h2) {
      current = { title: h2[1], body: '', children: [] }
      sub = null
      out.push(current)
    } else if (h3 && current) {
      sub = { title: h3[1], body: '', children: [] }
      current.children.push(sub)
    } else if (sub) sub.body += `${line}\n`
    else if (current) current.body += `${line}\n`
  }
  return out
}
const words = (text: string) => (text.match(/[\p{L}\p{N}'-]+/gu) ?? []).length
const find = (all: Section[], pattern: RegExp) => all.find((section) => pattern.test(section.title))

function adrText(): { file: string; text: string } {
  const dir = join(env.root(), 'docs', 'adr')
  const files = existsSync(dir) ? readdirSync(dir).filter((name) => /^0001-.+\.md$/.test(name)) : []
  expect(files, 'docs/adr/0001-<short-title>.md is missing (create the folder and the file; the number is part of the name)').toHaveLength(1)
  return { file: files[0], text: readFileSync(join(dir, files[0]), 'utf8') }
}

describe('A09 the decision record', () => {
  test('A09.1 docs/adr/0001-….md has Context, at least three Options (each with how it fails), a Decision that picks one of them, and Consequences', () => {
    const { file, text } = adrText()
    const all = sections(text)
    const context = find(all, /^context\b/i)
    const options = find(all, /^(considered )?options\b/i)
    const decision = find(all, /^decision\b/i)
    const consequences = find(all, /^consequences\b/i)
    expect({ context: !!context, options: !!options, decision: !!decision, consequences: !!consequences }, `${file}: sections found (need "## Context", "## Options", "## Decision", "## Consequences")`).toEqual({ context: true, options: true, decision: true, consequences: true })

    expect(words(context!.body), 'Context: say what happened and what forces the choice (60 words or more)').toBeGreaterThanOrEqual(60)

    const candidates = options!.children
    expect(candidates.length, 'Options: one "### <name>" subsection per option, at least three').toBeGreaterThanOrEqual(3)
    for (const option of candidates) {
      const failure = option.body.split('\n').find((line) => /fail(ure)?\s+mode|how it fails|fails when|breaks when/i.test(line))
      expect(failure, `Option "${option.title}": add a line saying how it fails (it must contain "failure mode", "how it fails", "fails when" or "breaks when")`).toBeDefined()
      expect(words(failure!.replace(/^[^:]*:/, '')), `Option "${option.title}": the failure mode needs a sentence, not a label (10 words or more)`).toBeGreaterThanOrEqual(10)
      expect(words(option.body), `Option "${option.title}": describe it (30 words or more)`).toBeGreaterThanOrEqual(30)
    }
    const names = candidates.map((option) => option.title.toLowerCase().replace(/^option\s*\w*[:.)-]?\s*/, '').trim()).filter(Boolean)
    expect(words(decision!.body), 'Decision: say what you chose and why (25 words or more)').toBeGreaterThanOrEqual(25)
    expect(names.some((name) => decision!.body.toLowerCase().includes(name)), `Decision: name the option you chose, using its heading text (one of: ${names.join(' | ')})`).toBe(true)
    expect(words(consequences!.body), 'Consequences: what gets easier, what gets harder, what is still unprotected (40 words or more)').toBeGreaterThanOrEqual(40)
  })
})
