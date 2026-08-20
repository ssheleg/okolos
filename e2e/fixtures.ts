import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, test as base, type BrowserContext } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const BUILD = path.join(here, '..', 'apps', 'extension', 'dist', 'chrome')

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

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // Playwright's fixture API requires the destructured first argument even
  // when this fixture takes nothing from it.
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
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
    await use(context)
    await context.close()
  },

  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers()
    if (!worker) worker = await context.waitForEvent('serviceworker')
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
 * Several origins, each with its own document.
 *
 * `serve` answers every path with one body, which is right for a single page and
 * useless for a frame: an embedded document has to come from a different origin for
 * the browser to give it its own frame id, and that id is what tells a subframe from
 * the top one. Keyed by host so a test reads as "this page embeds that one".
 */
export async function serveHosts(
  context: BrowserContext,
  bodies: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [host, html] of Object.entries(bodies)) {
    await context.route(`https://${host}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
    )
  }
}
