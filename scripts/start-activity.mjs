#!/usr/bin/env node
// Some activities start from code that already exists in the product: an endpoint a contractor wrote, a module with a known weakness.
// That code is not in your checkout until you ask for it, so you meet it the way you would meet it at work: as a stranger's code.
//
//   npm run start-activity -- 6          copies the starter files of activity 6 into your working tree (nothing is overwritten)
//   npm run start-activity -- 6 --dry-run   shows what it would copy
//
// The files come from the `reference` branch with `git show`; your branch is never switched.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { readdirSync } from 'node:fs'
import { describeMiss, findInReference, showFile } from './lib/reference.mjs'

const root = resolve(import.meta.dirname, '..')
const [numberArg, flag] = process.argv.slice(2)
if (!numberArg || !/^\d{1,2}$/.test(numberArg)) {
  console.error('usage: npm run start-activity -- <activity number> [--dry-run]   (example: npm run start-activity -- 6)')
  process.exit(1)
}
const number = numberArg.padStart(2, '0')
const dryRun = flag === '--dry-run'

const activities = join(root, 'course', 'activities')
const activityDir = readdirSync(activities).find((name) => name.startsWith(`${number}-`))
if (!activityDir) {
  console.error(`There is no activity ${number} in course/activities.`)
  process.exit(1)
}

const { hit, checked, fetched } = findInReference(new RegExp(`^course/activities/(${number}-[^/]+)/overlay/(.+)$`))
if (!hit) {
  console.log(`Activity ${number} has no starter files, or they are not published yet (${describeMiss({ checked, fetched })}).`)
  console.log(`Read course/activities/${activityDir}/ACTIVITY.md and begin.`)
  process.exit(0)
}

const { ref, found } = hit
const folders = [...new Set(found.map((match) => match[1]))]
if (folders.length > 1) {
  console.error(`${ref} has more than one overlay folder for activity ${number} (${folders.join(', ')}). The reference branch needs cleaning up.`)
  process.exit(1)
}

let added = 0
let blocked = 0
for (const match of found) {
  const relative = match[2]
  const destination = join(root, relative)
  const content = showFile(ref, `course/activities/${folders[0]}/overlay/${relative}`)
  if (existsSync(destination)) {
    if (readFileSync(destination, 'utf8') === content) {
      console.log(`  same      ${relative}`)
    } else {
      console.log(`  EXISTS    ${relative}   (different from the starter file; left alone: move yours aside and run this again if you want the original)`)
      blocked++
    }
    continue
  }
  console.log(`  ${dryRun ? 'would add' : 'added    '} ${relative}`)
  if (!dryRun) {
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, content)
  }
  added++
}
console.log(`\n${dryRun ? 'Would add' : 'Added'} ${added} file(s)${blocked ? `, left ${blocked} alone` : ''}. Now read course/activities/${activityDir}/ACTIVITY.md.`)
