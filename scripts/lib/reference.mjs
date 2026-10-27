// Reading files from the `reference` branch without checking it out. Shared by `npm run solution` and `npm run start-activity`.
import { execFileSync } from 'node:child_process'

export function git(...args) {
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

export const candidateRefs = () => (process.env.SOLUTION_REF ? [process.env.SOLUTION_REF] : ['reference', 'origin/reference'])

/**
 * Looks in every candidate ref for files under course/activities/ whose path matches `pattern`, and returns the ref with the newest commit
 * among those that have any (a stale local branch must not hide a newer one on origin). If none has any, fetches origin/reference once and
 * looks again. The explicit refspec matters: in a single-branch or shallow clone a plain `git fetch origin reference` only writes FETCH_HEAD.
 */
export function findInReference(pattern) {
  const lookup = () => {
    const checked = []
    const hits = []
    for (const ref of candidateRefs().filter(refExists)) {
      checked.push(`${ref}@${git('rev-parse', '--short', ref).trim()}`)
      // -z: NUL-separated, unquoted paths (git otherwise quotes names containing non-ASCII bytes, and they would silently not match)
      const found = git('ls-tree', '-r', '-z', '--name-only', ref, '--', 'course/activities/').split('\0').map((file) => file.match(pattern)).filter(Boolean)
      if (found.length > 0) hits.push({ ref, found, committed: Number(git('log', '-1', '--format=%ct', ref).trim()) })
    }
    hits.sort((a, b) => b.committed - a.committed)
    return { hit: hits[0], checked }
  }

  let { hit, checked } = lookup()
  let fetched = false
  if (!hit && !process.env.SOLUTION_REF) {
    try {
      git('fetch', '--quiet', 'origin', '+refs/heads/reference:refs/remotes/origin/reference')
      fetched = true
    } catch {
      // no remote, or no reference branch on it: reported by the caller
    }
    ;({ hit, checked } = lookup())
  }
  return { hit, checked, fetched }
}

export function describeMiss({ checked, fetched }) {
  const where = checked.length > 0 ? `Looked in ${checked.join(', ')}` : `No ${candidateRefs().join(' or ')} ref exists`
  return `${where}${fetched ? ' (fetched origin/reference just now)' : ''}`
}

export const shortSha = (ref) => git('rev-parse', '--short', ref).trim()
export const showFile = (ref, path) => git('show', `${ref}:${path}`)
