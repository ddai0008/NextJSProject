#!/usr/bin/env node
// Print an activity's reference solution without leaving your branch.
//
//   npm run solution 05              prints course/activities/05-*/solution/SOLUTION.md
//   npm run solution 05 -- --list    lists every file under that activity's solution/
//   npm run solution 05 <file>       prints another file from solution/ (path relative to solution/)
//
// It reads the `reference` branch (or origin/reference) with `git show`; your working tree and branch are never touched.
// Set SOLUTION_REF to read from a different ref.
import { execFileSync } from 'node:child_process'

const usage = 'usage: npm run solution <activity number> [<file> | --list]   (example: npm run solution 05)'

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

function refExists(ref) {
  try {
    git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`)
    return true
  } catch {
    return false
  }
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

const [numberArg, second] = process.argv.slice(2)
if (!numberArg || !/^\d{1,2}$/.test(numberArg)) fail(usage)
const number = numberArg.padStart(2, '0')

const candidates = process.env.SOLUTION_REF ? [process.env.SOLUTION_REF] : ['reference', 'origin/reference']
const pattern = new RegExp(`^course/activities/(${number}-[^/]+)/solution/(.+)$`)

// Every existing ref that has a solution for this activity; a stale local branch must not hide a newer one on origin.
function lookup() {
  const checked = []
  const hits = []
  for (const ref of candidates.filter(refExists)) {
    checked.push(`${ref}@${git('rev-parse', '--short', ref).trim()}`)
    const found = git('ls-tree', '-r', '--name-only', ref, '--', 'course/activities/').split('\n').map((file) => file.match(pattern)).filter(Boolean)
    if (found.length > 0) hits.push({ ref, found, committed: Number(git('log', '-1', '--format=%ct', ref).trim()) })
  }
  hits.sort((a, b) => b.committed - a.committed)
  return { hit: hits[0], checked }
}

let { hit, checked } = lookup()
let fetched = false
if (!hit && !process.env.SOLUTION_REF) {
  // Nothing found locally: the solution may have been published since the last fetch.
  try {
    git('fetch', '--quiet', 'origin', 'reference')
    fetched = true
  } catch {
    // no remote, or no reference branch on it: reported below
  }
  ;({ hit, checked } = lookup())
}
if (!hit) {
  const where = checked.length > 0 ? `Looked in ${checked.join(', ')}` : `No ${candidates.join(' or ')} ref exists`
  fail(`No solution for activity ${number} yet. ${where}${fetched ? ' (fetched origin/reference just now)' : ''}. Solutions are published to the reference branch as each phase is generated.`)
}

const { ref, found } = hit
const activityDir = found[0][1]
const solutionFiles = found.map((match) => match[2])

if (second === '--list') {
  console.log(solutionFiles.join('\n'))
  process.exit(0)
}

const wanted = second ?? 'SOLUTION.md'
if (!solutionFiles.includes(wanted)) {
  fail(`No ${wanted} in ${activityDir}/solution/ on ${ref}. Files there:\n${solutionFiles.map((f) => `  ${f}`).join('\n')}`)
}

console.error(`Solution for ${activityDir} (${wanted}) from ${ref}@${git('rev-parse', '--short', ref).trim()}. Hints you may not have tried: course/activities/${activityDir}/hints/`)
process.stdout.write(git('show', `${ref}:course/activities/${activityDir}/solution/${wanted}`))
