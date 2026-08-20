import { expect, type BrowserContext, type Page } from '@playwright/test'

import { SURFACE_MOUNT_MS } from './budgets.js'

/**
 * Waiting for the banner, and saying which link broke when it does not come.
 *
 * `await expect(page.locator('okolos-banner')).toHaveCount(1, …)` reports
 * *"44 × locator resolved to 0 elements"* and nothing else. Between the navigation
 * and the banner there are five links — the extension loaded, the service worker
 * booted, the content script ran, it produced a verdict, the RPC came back — and
 * that message distinguishes none of them. The class has now failed twice on CI in
 * tests that were not about mounting: four checks in `scn-010` on 2026-08-20, and
 * "Allow once lets that one action through" the same night, 20.6 s for a surface its
 * four siblings mounted in 700 ms.
 *
 * So the wait carries a report. It changes nothing about a passing run — the same
 * assertion, the same budget — and turns the next failure from a guess into a
 * reading. It does not attempt a fix: what makes one spec out of five hang is
 * recorded as B-73 and unknown.
 */
export async function expectBanner(page: Page, context?: BrowserContext): Promise<void> {
  try {
    await expect(page.locator('okolos-banner')).toHaveCount(1, { timeout: SURFACE_MOUNT_MS })
  } catch (cause) {
    throw new Error(`${(cause as Error).message}\n\n${await diagnose(page, context)}`)
  }
}

/**
 * What is true at the moment the banner is not there.
 *
 * Every line is a fact this test can still read after the wait ran out, and each one
 * eliminates a link: no service worker means the extension never started; a page
 * with no content-script trace means it never ran; a trace with no host means the
 * verdict never came back.
 */
async function diagnose(page: Page, context?: BrowserContext): Promise<string> {
  const lines: string[] = ['what was true when the banner did not appear:']

  const workers = context?.serviceWorkers() ?? []
  lines.push(
    workers.length === 0
      ? '  - no service worker: the extension had not started, or failed to load'
      : `  - ${workers.length} service worker(s): ${workers.map((w) => w.url().split('/')[2]).join(', ')}`,
  )

  try {
    const page_ = await page.evaluate(() => ({
      url: location.href,
      // Custom elements are upgraded lazily; asking the DOM directly separates
      // "the element is absent" from "the element is there and empty".
      hosts: document.querySelectorAll('okolos-banner, okolos-gate, okolos-comparison').length,
      neutralised: document.querySelectorAll('[data-okolos-neutralised]').length,
      ready: document.readyState,
      nodes: document.querySelectorAll('*').length,
      /**
       * Did the content script get as far as scanning?
       *
       * The one fact that separates "it never ran" from "it ran and the verdict never
       * came back" — and the one this report did not carry on its first live firing.
       * CI, 2026-08-20: a worker registered, the page complete with ten nodes, zero
       * hosts, and nothing to say which of the two links had broken. The product marks
       * its own scan (`performance.measure('okolos:collect')`), so the answer was
       * already on the page and nobody asked for it.
       */
      scanned: performance.getEntriesByName('okolos:collect')[0]?.duration ?? null,
    }))
    lines.push(`  - page ${page_.url} (${page_.ready}), ${page_.nodes} nodes`)
    lines.push(
      page_.scanned === null
        ? '  - the content script never finished a scan: it did not run, or it threw'
        : `  - the content script scanned in ${page_.scanned.toFixed(1)} ms, so the verdict is what did not arrive`,
    )
    lines.push(
      `  - ${page_.hosts} okolos host element(s), ${page_.neutralised} neutralised node(s)`,
    )
    if (page_.hosts > 0) {
      /**
       * The report is taken *after* the wait ran out, so a surface that is here now
       * was not here then. Said out loud because the alternative reading — "the
       * assertion is lying" — is the one a reader arrives at on their own, and it
       * sends them to rewrite a working check.
       */
      lines.push(
        '  - it is here NOW, which means the wait ended before the mount did, not that',
      )
      lines.push('    the assertion was wrong: this report is a moment later than the failure')
    }
  } catch (cause) {
    // The page may be gone; that is itself the answer.
    lines.push(`  - the page could not be read: ${String(cause)}`)
  }

  lines.push(
    '  - the trace holds the network and console for every step: `pnpm exec playwright show-trace`',
  )
  return lines.join('\n')
}
