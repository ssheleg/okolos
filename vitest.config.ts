import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tools/**/*.test.ts'],
    // e2e belongs to Playwright; vitest must not try to run those specs.
    exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'],
    // Per-file environments are set with a docblock:
    //   /** @vitest-environment happy-dom */
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
    },
  },
})
