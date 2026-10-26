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
let ref = candidates.find(refExists)
if (!ref && !process.env.SOLUTION_REF) {
  try {
    git('fetch', '--quiet', 'origin', 'reference')
    ref = candidates.find(refExists)
  } catch {
    // no remote or no such branch: handled below
  }
}
if (!ref) {
  fail(`No ${candidates.join(' or ')} ref found. Solutions are published to the reference branch as each phase is generated.`)
}

const files = git('ls-tree', '-r', '--name-only', ref, '--', 'course/activities/').split('\n').filter(Boolean)
const pattern = new RegExp(`^course/activities/(${number}-[^/]+)/solution/(.+)$`)
const found = files.map((file) => file.match(pattern)).filter(Boolean)

if (found.length === 0) fail(`${ref} has no solution for activity ${number} yet.`)

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
