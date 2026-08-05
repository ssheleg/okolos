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
export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright's fixture API
  // requires the destructured first argument even when nothing is taken.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${BUILD}`, `--load-extension=${BUILD}`],
    })
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
