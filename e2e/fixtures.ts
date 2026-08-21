import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, test as base, type BrowserContext } from '@playwright/test'

import { buildTooOld } from '../tools/build-age.mjs'

import { extensionWorker } from './ready.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const BUILD = path.join(here, '..', 'apps', 'extension', 'dist', 'chrome')


/**
 * Refuses before a browser starts, rather than reporting a green from an old build.
 *
 * The two harnesses load two directories and `pnpm build:e2e` refreshes one of
 * them, so "I rebuilt" and "the build under this spec is current" were different
 * facts that looked like one. A planted defect stayed green across three checks on
 * exactly that difference (B-42). Checked here rather than remembered: the habit
 * that caught it twice is not a mechanism.
 */
const stale = buildTooOld(BUILD, 'pnpm build')
if (stale !== null) throw new Error(`e2e: ${stale}`)

/**
 * Loads the built extension the way a user would, then serves the test pages
 * over an intercepted https origin.
 *
 * The origin matters: content scripts are declared for http and https, so a
 * file:// fixture would silently never run the code under test and the suite
 * would pass by doing nothing.
 */
/**
 * Everything the suite tried to send outside, in order.
 *
 * Shared rather than per-context because the check that reads it runs after the
 * context is gone. Cleared per context so one spec cannot see another's.
 */
export const outbound: string[] = []

export const test = base.extend<{
  context: BrowserContext
  extensionId: string
  /**
   * Navigate before the extension has registered, on purpose.
   *
   * Only `cold-start.spec.ts` sets this: a booted worker is the one thing that file must
   * not have, because the figure it asserts is what a person waits for on the first page
   * of a session. Everywhere else the wait is a precondition nobody should have to
   * remember — see `ready.ts`.
   */
  coldWorker: boolean
}>({
  coldWorker: [false, { option: true }],

  context: async ({ coldWorker }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${BUILD}`, `--load-extension=${BUILD}`],
    })

    /**
     * No test reaches the internet.
     *
     * The extension pulls its blocking feed from the production worker, and
     * nothing here stopped it. That made the suite depend on a deployed service
     * being up and on what it currently serves — and it caused the SCN-007 flake
     * directly: a test would seed a feed naming `fixture.test`, install the
     * rules, and then lose the race to the real feed landing and replacing them
     * with four production domains. The page it expected to be blocked then
     * loaded, roughly one run in seventy.
     *
     * **"At every service-worker boot" was the accurate description until
     * 2026-08-20, and it was also a product defect.** The pull had no due-check,
     * and an MV3 worker boots on nearly every page; the feed now records its last
     * attempt and skips a pull inside six hours (B-54). This block stays exactly
     * as it is: a test's fresh profile has no timestamp, so the first boot in each
     * test still pulls, which is the race this closes — and a suite that reaches
     * the internet is wrong for reasons that have nothing to do with cadence.
     *
     * Registered first, so any route a test adds later takes precedence — that
     * is how a spec stubs the one destination it is actually about.
     */
    await context.route(/^https?:\/\//, async (route) => {
      const url = route.request().url()
      if (url.startsWith('https://fixture.test/')) return route.fallback()
      outbound.push(url)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'the e2e fixture does not let the suite reach the internet' }),
      })
    })

    outbound.length = 0
    // Before any test navigates: a tab opened ahead of registration runs no content
    // script and never gets one, which looks exactly like a detector that found nothing.
    if (!coldWorker) await extensionWorker(context)
    await use(context)
    await context.close()
  },

  extensionId: async ({ context }, use) => {
    const worker = await extensionWorker(context)
    await use(worker.url().split('/')[2] as string)
  },
})

export const expect = test.expect

/** Serves one HTML body at https://fixture.test/ for the whole context. */
export async function serve(context: BrowserContext, html: string): Promise<void> {
  await context.route('https://fixture.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
  )
}

/**
 * Re-exported, not defined here: both harnesses serve several hosts, and the one that
 * loads the hooked build must not import this file to get it (`serve.ts` says why).
 */
export { serveHosts } from './serve.js'
