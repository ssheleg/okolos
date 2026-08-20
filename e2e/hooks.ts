import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, test as base, type BrowserContext } from '@playwright/test'

import { buildTooOld } from '../tools/build-age.mjs'

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
