import { defineConfig } from '@playwright/test'

/**
 * Extensions only load in a persistent Chromium context with a head, so these
 * run headed under xvfb in CI. Firefox is absent on purpose and honestly:
 * Playwright cannot load an MV3 extension into it, so that side is covered by
 * `web-ext` and is recorded in the carry-over ledger rather than pretended.
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
