import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('..', import.meta.url))

// The acceptance tests. Start them with `npm run act -- <n>`, not with `vitest` directly: the runner prepares the database
// and the app and passes their addresses in through the environment.
export default defineConfig({
  root,
  resolve: {
    alias: [
      { find: /^@\//, replacement: root },
      // `server-only` throws when it is imported outside a React Server Component build. In tests we import server code on purpose.
      { find: 'server-only', replacement: `${root}tests/support/empty.ts` },
    ],
  },
  test: {
    include: ['tests/activities/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // The files share one database and one running app, so they run one after another.
    fileParallelism: false,
    setupFiles: ['tests/support/setup.ts'],
  },
})
