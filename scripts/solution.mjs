#!/usr/bin/env node
// Print an activity's reference solution without leaving your branch.
//
//   npm run solution 05              prints course/activities/05-*/solution/SOLUTION.md
//   npm run solution 05 -- --list    lists every file under that activity's solution/
//   npm run solution 05 <file>       prints another file from solution/ (path relative to solution/)
//
// It reads the `reference` branch (or origin/reference) with `git show`; your working tree and branch are never touched.
// Set SOLUTION_REF to read from a different ref.
import { describeMiss, findInReference, shortSha, showFile } from './lib/reference.mjs'

const usage = 'usage: npm run solution <activity number> [<file> | --list]   (example: npm run solution 05)'

function fail(message) {
  console.error(message)
  process.exit(1)
}

const [numberArg, second] = process.argv.slice(2)
if (!numberArg || !/^\d{1,2}$/.test(numberArg)) fail(usage)
const number = numberArg.padStart(2, '0')

const { hit, checked, fetched } = findInReference(new RegExp(`^course/activities/(${number}-[^/]+)/solution/(.+)$`))
if (!hit) fail(`No solution for activity ${number} yet. ${describeMiss({ checked, fetched })}. Solutions are published to the reference branch as each phase is generated.`)

const { ref, found } = hit
const activityDirs = [...new Set(found.map((match) => match[1]))]
if (activityDirs.length > 1) {
  fail(`${ref} has more than one folder for activity ${number} (${activityDirs.join(', ')}), so I can't tell which solution you mean. The reference branch needs cleaning up.`)
}
const activityDir = activityDirs[0]
const solutionFiles = found.map((match) => match[2])

if (second === '--list') {
  console.log(solutionFiles.join('\n'))
  process.exit(0)
}

const wanted = second ?? 'SOLUTION.md'
if (!solutionFiles.includes(wanted)) {
  fail(`No ${wanted} in ${activityDir}/solution/ on ${ref}. Files there:\n${solutionFiles.map((f) => `  ${f}`).join('\n')}`)
}

console.error(`Solution for ${activityDir} (${wanted}) from ${ref}@${shortSha(ref)}. Hints you may not have tried: course/activities/${activityDir}/hints/`)
try {
  process.stdout.write(showFile(ref, `course/activities/${activityDir}/solution/${wanted}`))
} catch (error) {
  fail(`Could not read ${wanted} from ${ref}: ${String(error.stderr ?? error.message).trim()}`)
}
