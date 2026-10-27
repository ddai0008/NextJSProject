#!/usr/bin/env node
// The activity runner.
//
//   npm run act -- 3                 run the acceptance tests of activity 3
//   npm run act:upto -- 3            run activities 1..3 (what "nothing I did earlier broke" means)
//   npm run act -- 3 -t "walking"    only the tests whose name contains "walking" (passed to Vitest)
//   npm run act -- 3 --no-build      reuse the last build in .next (use it when only a test or a doc changed)
//   npm run act -- --list            list the activities
//
// What it does for you: checks Node and Docker, starts Postgres from compose.yaml, builds a test database (migrations + a
// small deterministic seed, cached until a migration changes), gives this run its own copy of it, builds the app WITHOUT a
// database (on purpose: a build that needs one is a bug), starts it with `next start`, runs the tests, and cleans up.
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, copyFileSync, openSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import pg from 'pg'
import { createFromTemplate, databaseExists, dropDatabase, roleExists, templateHash, urlFor, withAdmin } from './lib/db.mjs'
import { seed } from './lib/seed.mjs'

const root = resolve(import.meta.dirname, '..')
const actDir = join(root, '.act')
const progressFile = join(root, 'course', 'progress.json')
const bold = (s) => `\x1b[1m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const say = (s) => console.log(s)
const step = (s) => console.log(dim(`› ${s}`))

class UserError extends Error {}

// ---------- arguments and activities ----------
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const valueOf = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)

function discoverActivities() {
  const dir = join(root, 'course', 'activities')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => /^\d\d-/.test(name) && existsSync(join(dir, name, 'activity.json')))
    .sort()
    .map((name) => ({ dir: name, number: Number(name.slice(0, 2)), ...JSON.parse(readFileSync(join(dir, name, 'activity.json'), 'utf8')) }))
}

function selectActivities(all) {
  const upto = valueOf('--upto')
  if (upto) return all.filter((a) => a.number <= Number(upto))
  const positional = argv.find((a, i) => /^\d+$/.test(a) && argv[i - 1] !== '--upto' && argv[i - 1] !== '-t')
  if (positional) {
    const picked = all.filter((a) => a.number === Number(positional))
    if (picked.length === 0) throw new UserError(`There is no activity ${positional}. Try: npm run act -- --list`)
    return picked
  }
  throw new UserError('Which activity? Example: npm run act -- 3   (or: npm run act:upto -- 3, npm run act -- --list)')
}

// ---------- processes ----------
const children = new Set()
function killGroup(child, signal = 'SIGTERM') {
  try {
    process.kill(-child.pid, signal)
  } catch {
    // already gone
  }
}
async function stopChild(child) {
  if (child.exitCode !== null) return
  killGroup(child, 'SIGTERM')
  const deadline = Date.now() + 5000
  while (child.exitCode === null && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100))
  if (child.exitCode === null) killGroup(child, 'SIGKILL')
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolvePort(port))
    })
    server.on('error', reject)
  })
}

function nextBin() {
  return join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
}

// ---------- preflight ----------
function preflight(needs) {
  const wanted = readFileSync(join(root, '.nvmrc'), 'utf8').trim().replace(/^v/, '')
  if (process.versions.node !== wanted) {
    throw new UserError(`Node ${wanted} is pinned in .nvmrc but this shell runs ${process.versions.node}. Run: source scripts/use-node.sh`)
  }
  if (needs.has('db') || needs.has('app')) {
    const docker = spawnSync('docker', ['ps'], { encoding: 'utf8' })
    if (docker.status !== 0) {
      throw new UserError(
        'Docker is not reachable from this shell. Start Docker Desktop and turn on WSL integration ' +
          '(Settings > Resources > WSL integration), then check that `docker ps` works.\n' + (docker.stderr ?? '').trim(),
      )
    }
    step('starting Postgres (docker compose up --wait)')
    const up = spawnSync('docker', ['compose', 'up', '-d', '--wait', 'postgres'], { cwd: root, encoding: 'utf8' })
    if (up.status !== 0) {
      const logs = spawnSync('docker', ['compose', 'logs', '--no-log-prefix', '--tail', '25', 'postgres'], { cwd: root, encoding: 'utf8' })
      throw new UserError(`Postgres did not start (docker compose up --wait failed).\n${up.stderr.trim()}\n\nThe container's last log lines:\n${logs.stdout.trim() || '(none)'}`)
    }
  }
}

// ---------- databases ----------
async function ensureTemplate() {
  const journal = join(root, 'db', 'migrations', 'meta', '_journal.json')
  if (!existsSync(journal)) return null
  const name = `crm_tpl_${templateHash(root)}`
  if (await databaseExists(name)) return name
  step('building the test database (migrations + seed); cached until a migration changes')
  const stale = await withAdmin(async (c) => (await c.query(`select datname from pg_database where datname like 'crm\\_tpl\\_%'`)).rows.map((r) => r.datname))
  for (const old of stale) await dropDatabase(old)
  await withAdmin((c) => c.query(`create database "${name}"`))
  try {
    const { drizzle } = await import('drizzle-orm/node-postgres')
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    const pool = new pg.Pool({ connectionString: urlFor(name), max: 1 })
    try {
      await migrate(drizzle(pool), { migrationsFolder: join(root, 'db', 'migrations') })
      await pool.query('create extension if not exists pg_stat_statements')
    } catch (error) {
      throw new UserError(`Your migrations do not apply to an empty database:\n${error.cause?.message ?? error.message}`)
    } finally {
      await pool.end()
    }
    try {
      await seed({ url: urlFor(name), scale: 'test' })
    } catch (error) {
      throw new UserError(`The seed does not load into your schema:\n${error.message}`)
    }
  } catch (error) {
    await dropDatabase(name)
    throw error
  }
  return name
}

// Runs that were killed (Ctrl-C, closed terminal) leave their database behind; remove those whose process is gone.
async function dropLeftoverRunDatabases() {
  const names = await withAdmin(async (c) => (await c.query(`select datname from pg_database where datname like 'crm\\_run\\_%'`)).rows.map((r) => r.datname))
  for (const name of names) {
    const pid = Number(name.replace('crm_run_', ''))
    try {
      process.kill(pid, 0)
    } catch {
      await dropDatabase(name)
    }
  }
}

// ---------- the app ----------
async function waitForServer(url, child, logFile) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new UserError(`The app exited while starting. See ${logFile}`)
    try {
      await fetch(url, { redirect: 'manual' })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  throw new UserError(`The app did not answer on ${url} within 60 s. See ${logFile}`)
}

function build(cwd, logFile) {
  const out = openSync(logFile, 'w')
  const result = spawnSync(process.execPath, [nextBin(), 'build'], {
    cwd,
    stdio: ['ignore', out, out],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', DATABASE_URL: 'postgres://nobody:nobody@127.0.0.1:1/none' },
  })
  if (result.status !== 0) {
    const tail = readFileSync(logFile, 'utf8').split('\n').slice(-40).join('\n')
    throw new UserError(`next build failed (log: ${logFile}). The build runs with no database on purpose.\n${tail}`)
  }
}

async function startApp(cwd, logFile, env) {
  const port = await freePort()
  const out = openSync(logFile, 'w')
  const child = spawn(process.execPath, [nextBin(), 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd,
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, ...env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
  })
  children.add(child)
  await waitForServer(`http://127.0.0.1:${port}/`, child, logFile)
  return { port, child }
}

function prepareNoProxyCopy() {
  const dir = join(actDir, 'noproxy')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const entry of ['app', 'lib', 'db', 'components', 'public']) if (existsSync(join(root, entry))) cpSync(join(root, entry), join(dir, entry), { recursive: true })
  for (const file of ['next.config.ts', 'package.json', 'tsconfig.json', 'components.json', 'eslint.config.mjs', 'postcss.config.mjs']) {
    if (existsSync(join(root, file))) copyFileSync(join(root, file), join(dir, file))
  }
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir')
  return dir // proxy.ts / middleware.ts are deliberately not copied
}

// ---------- progress ----------
function markDone(number) {
  const current = existsSync(progressFile) ? JSON.parse(readFileSync(progressFile, 'utf8')).completed : 0
  if (number > current) {
    writeFileSync(progressFile, JSON.stringify({ completed: number }, null, 2) + '\n')
    say(green(`Marked activity ${number} as done in course/progress.json (commit it).`))
  }
}

// ---------- main ----------
async function main() {
  const all = discoverActivities()
  if (flag('--list')) {
    const completed = existsSync(progressFile) ? JSON.parse(readFileSync(progressFile, 'utf8')).completed : 0
    for (const a of all) say(`${a.number <= completed ? green('done ') : '     '} A${String(a.number).padStart(2, '0')}  ${a.title}`)
    return 0
  }
  const selected = selectActivities(all)
  const needs = new Set(selected.flatMap((a) => a.needs ?? []))
  mkdirSync(actDir, { recursive: true })

  say(bold(`Activities: ${selected.map((a) => `A${String(a.number).padStart(2, '0')}`).join(', ')}`))
  preflight(needs)

  const env = {
    ACT_ROOT: root,
    ACT_ACTIVITIES: selected.map((a) => a.number).join(','),
    ACT_DEV_DB_URL: urlFor('crm'),
    ACT_ADMIN_URL: urlFor('postgres'),
  }
  let runDb = null
  const servers = []
  try {
    if (needs.has('db') || needs.has('app')) {
      await dropLeftoverRunDatabases()
      const template = await ensureTemplate()
      if (template) {
        runDb = `crm_run_${process.pid}`
        await dropDatabase(runDb)
        await createFromTemplate(runDb, template)
        const appRole = (await roleExists('crm_app')) ? { user: 'crm_app', password: 'crm_app' } : {}
        Object.assign(env, { ACT_RUN_DB: runDb, ACT_DB_URL: urlFor(runDb), ACT_APP_DB_URL: urlFor(runDb, appRole), DATABASE_URL: urlFor(runDb, appRole) })
      } else {
        step('no migrations yet (db/migrations): tests that need the test database will fail')
      }
    }
    if (needs.has('app')) {
      if (flag('--no-build') && existsSync(join(root, '.next', 'BUILD_ID'))) step('reusing the last build (.next)')
      else {
        step('building the app (next build, no database)')
        build(root, join(actDir, 'build.log'))
      }
      env.ACT_BUILD_LOG = join(actDir, 'build.log')
      step('starting the app (next start)')
      const app = await startApp(root, join(actDir, 'server.log'), { DATABASE_URL: env.DATABASE_URL ?? urlFor('crm'), SESSION_TTL_SECONDS: '3600' })
      servers.push(app)
      env.ACT_BASE_URL = `http://127.0.0.1:${app.port}`
      env.ACT_SERVER_LOG = join(actDir, 'server.log')
    }
    if (needs.has('noproxy')) {
      step('building a copy of the app WITHOUT proxy.ts (to prove no route relies on it)')
      const dir = prepareNoProxyCopy()
      build(dir, join(actDir, 'build-noproxy.log'))
      const app = await startApp(dir, join(actDir, 'server-noproxy.log'), { DATABASE_URL: env.DATABASE_URL ?? urlFor('crm'), SESSION_TTL_SECONDS: '3600' })
      servers.push(app)
      env.ACT_BASE_URL_NOPROXY = `http://127.0.0.1:${app.port}`
    }

    const files = selected.map((a) => `tests/activities/${a.dir}`)
    const args = [join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--config', 'tests/vitest.config.mts', ...files]
    if (valueOf('-t')) args.push('-t', valueOf('-t'))
    step('running the tests')
    const code = await new Promise((resolveCode) => {
      const vitest = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })
      vitest.on('exit', (c) => resolveCode(c ?? 1))
    })
    if (code === 0 && !valueOf('-t')) {
      // `--upto N` passing means 1..N all pass; a single activity counts only if it is the next one in line.
      const last = selected[selected.length - 1].number
      const completed = existsSync(progressFile) ? JSON.parse(readFileSync(progressFile, 'utf8')).completed : 0
      if (valueOf('--upto') || last <= completed + 1) markDone(last)
    }
    say(code === 0 ? green(bold('All acceptance criteria pass.')) : red(bold('Some acceptance criteria fail. Read the first failure first; it usually explains the rest.')))
    return code
  } finally {
    for (const { child } of servers) await stopChild(child)
    if (runDb && !flag('--keep')) await dropDatabase(runDb).catch(() => {})
    rmSync(join(actDir, 'noproxy'), { recursive: true, force: true })
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) killGroup(child, 'SIGKILL')
    process.exit(130)
  })
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(red(error instanceof UserError ? error.message : error.stack ?? String(error)))
    process.exit(1)
  },
)
