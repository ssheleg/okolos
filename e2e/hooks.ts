import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, test as base, type BrowserContext } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * The same extension, built with the shadow root open so a test can click what
 * a user clicks. Everything else is identical, and a bundle gate asserts the
 * production build never carries the flag — see REQ-35.
 */
const BUILD = path.join(here, '..', 'apps', 'extension', 'dist', 'chrome-e2e')

export const test = base.extend<{ context: BrowserContext }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${BUILD}`, `--load-extension=${BUILD}`],
    })
    await use(context)
    await context.close()
  },
})

export const expect = test.expect

export async function serve(context: BrowserContext, html: string): Promise<void> {
  await context.route('https://fixture.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
  )
}
