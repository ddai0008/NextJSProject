import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { env } from './env'

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

export type ExtraApp = { url: string; stop: () => Promise<void> }

/**
 * Another instance of the already-built app, with different environment variables (for example a very short session lifetime).
 * Only for tests that must change configuration; everything else uses BASE_URL.
 */
export async function startExtraApp(extraEnv: Record<string, string>): Promise<ExtraApp> {
  const root = env.root()
  const port = await freePort()
  const child: ChildProcess = spawn(process.execPath, [join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: env.appDbUrl(), SESSION_TTL_SECONDS: '3600', ...extraEnv, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
  })
  const url = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 60_000
  for (;;) {
    if (child.exitCode !== null) throw new Error('The extra app instance exited while starting.')
    try {
      await fetch(url, { redirect: 'manual' })
      break
    } catch {
      if (Date.now() > deadline) throw new Error('The extra app instance did not start within 60 s.')
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  return {
    url,
    stop: async () => {
      try {
        process.kill(-child.pid!, 'SIGTERM')
      } catch {
        // already gone
      }
      const until = Date.now() + 5000
      while (child.exitCode === null && Date.now() < until) await new Promise((r) => setTimeout(r, 100))
      if (child.exitCode === null) {
        try {
          process.kill(-child.pid!, 'SIGKILL')
        } catch {
          // already gone
        }
      }
    },
  }
}
