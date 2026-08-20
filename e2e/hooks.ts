import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, test as base, type BrowserContext } from '@playwright/test'

import { buildTooOld } from '../tools/build-age.mjs'

import { WORKER_REGISTER_MS } from './budgets.js'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * The same extension, built with the shadow root open so a test can click what
 * a user clicks. Everything else is identical, and a bundle gate asserts the
 * production build never carries the flag — see REQ-35.
 */
const BUILD = path.join(here, '..', 'apps', 'extension', 'dist', 'chrome-e2e')


/**
 * Refuses before a browser starts, rather than reporting a green from an old build.
 *
 * The two harnesses load two directories and `pnpm build:e2e` refreshes one of
 * them, so "I rebuilt" and "the build under this spec is current" were different
 * facts that looked like one. A planted defect stayed green across three checks on
 * exactly that difference (B-42). Checked here rather than remembered: the habit
 * that caught it twice is not a mechanism.
 */
const stale = buildTooOld(BUILD, 'pnpm build:e2e')
if (stale !== null) throw new Error(`e2e: ${stale}`)

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${BUILD}`, `--load-extension=${BUILD}`],
    })
    await use(context)
    await context.close()
  },

  /**
   * The extension's own id, for a spec that has to read the store it writes to.
   *
   * IndexedDB is per origin, so a fixture page's `indexedDB.open('okolos')` opens an
   * empty database that has never heard of this product. Reading the journal means
   * opening an extension page, and that needs the id.
   *
   * Same shape and same named budget as `fixtures.ts`: an unnamed wait here reported
   * "Test timeout while setting up extensionId" over "target closed", which sends the
   * reader looking for a broken fixture instead of a busy machine (B-73).
   */
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers()
    if (!worker) {
      worker = await context
        .waitForEvent('serviceworker', { timeout: WORKER_REGISTER_MS })
        .catch(() => {
          throw new Error(
            `the extension's service worker did not register within ` +
              `${WORKER_REGISTER_MS / 1000}s — the extension may have failed to load, or this ` +
              `machine is busy enough that a fresh browser plus an extension load takes longer`,
          )
        })
    }
    await use(worker.url().split('/')[2] as string)
  },
})

export const expect = test.expect

export async function serve(context: BrowserContext, html: string): Promise<void> {
  await context.route('https://fixture.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
  )
}
