import { defineConfig } from '@playwright/test'

/**
 * Chromium only. Extensions load in a persistent context with a head, so these
 * run headed under xvfb in CI.
 *
 * Firefox is not absent — it simply cannot be driven from here: Playwright has
 * no way to install an extension into it. That side runs through geckodriver
 * in `tools/firefox-e2e.mjs` (`pnpm test:e2e:firefox`), which is how Mozilla
 * supports unpacked builds.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
})
