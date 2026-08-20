import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect, test } from '@playwright/test'
import { WORKER_REGISTER_MS } from './budgets.js'

/**
 * The extension loads at all.
 *
 * Nothing checked this until 2026-08-08, and the day it mattered the signal was
 * seventy-two tests timing out at fixture setup with "Test timeout exceeded
 * while setting up extensionId" — the same line, in every spec, for ten
 * minutes. The cause was one character in a message catalogue.
 *
 * A package can be rejected outright by the browser for reasons no unit test
 * sees: a malformed manifest, a `_locales` file it cannot parse, an icon it
 * cannot find. This asks the only question that comes before every other
 * question in this suite, and it asks it of both builds, because the two
 * differ and either can break alone.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

for (const build of ['chrome', 'chrome-e2e']) {
  test(`the ${build} package is one the browser accepts`, async () => {
    const dir = path.join(root, 'apps/extension/dist', build)
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
    })
    try {
      let [worker] = context.serviceWorkers()
      if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: WORKER_REGISTER_MS })
      expect(worker.url(), `${build} loaded, but its background is not where the manifest says`).toContain(
        'background.js',
      )
    } finally {
      await context.close()
    }
  })
}
