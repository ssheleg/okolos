import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { firefox, test as base, type BrowserContext } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const BUILD = path.join(here, '..', 'apps', 'extension', 'dist', 'firefox-e2e')
const ADDON_ID = 'okolos@ssheleg.dev'

/**
 * Firefox, the browser our cross-browser claim rests on and the one no test
 * touched until now.
 *
 * Playwright cannot install an extension through its API, so the profile is
 * prepared the way Firefox itself supports: a proxy file under
 * `<profile>/extensions/<addon-id>` holding the path to the unpacked build.
 * Signature enforcement is turned off by preference, which works because
 * Playwright ships an unbranded build rather than a release channel one.
 *
 * This exists because review — not a test — caught a bug that broke every
 * verdict in Firefox while Chrome stayed green. A claim about a browser nobody
 * runs is a claim about a build, not about behaviour. REQ-34.
 */
export const test = base.extend<{ context: BrowserContext }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const profile = mkdtempSync(path.join(tmpdir(), 'okolos-ff-'))
    mkdirSync(path.join(profile, 'extensions'), { recursive: true })
    writeFileSync(path.join(profile, 'extensions', ADDON_ID), BUILD, 'utf8')

    const context = await firefox.launchPersistentContext(profile, {
      firefoxUserPrefs: {
        'xpinstall.signatures.required': false,
        'extensions.autoDisableScopes': 0,
        'extensions.enabledScopes': 5,
        'extensions.startupScanScopes': 5,
      },
    })

    // Without this, a Firefox that ignored the extension would run every spec
    // below against a bare browser — and the negative cases ("stays silent on
    // an ordinary page") would pass by doing nothing at all. A suite that goes
    // green when the thing under test is absent is worse than no suite.
    await context.waitForEvent('backgroundpage', { timeout: 10_000 }).catch(() => undefined)
    if (context.backgroundPages().length === 0) {
      throw new Error(
        'the extension did not load into Firefox: no background page. ' +
          'Profile proxy-file installation does not work on this build — see REQ-34.',
      )
    }

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
