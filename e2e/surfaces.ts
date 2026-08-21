import { expect, type BrowserContext, type Page } from '@playwright/test'

import { RECORD_VISIBLE_MS, SURFACE_MOUNT_MS } from './budgets.js'

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
  await expectSurface(page, 'okolos-banner', context)
}

/**
 * The same wait and the same report, for a surface named some other way.
 *
 * Ten spec files reached for `expectBanner`; eight hand-rolled the assertion beside it,
 * and one of those is the reason this paragraph exists. `hostile-page.spec.ts` matches on
 * `[data-okolos=banner]` rather than on the tag — deliberately, because the host takes an
 * unpredictable name when a page has claimed the canonical one — so it could not use the
 * helper and had no report. It then failed on CI three times for a banner that never
 * arrived (B-65 twice, B-108 once), and each failure said "0 elements" and nothing else:
 * the third one cost a downloaded trace and an hour of hypotheses to reach a fact this
 * function prints in one line.
 *
 * A helper the sibling case cannot call is a helper that will be hand-rolled beside it,
 * which is why the selector is a parameter now and `tools/surface-waits.test.ts` refuses
 * the hand-rolled form.
 */
export async function expectSurface(
  page: Page,
  selector: string,
  context?: BrowserContext,
): Promise<void> {
  try {
    await expect(page.locator(selector)).toHaveCount(1, { timeout: SURFACE_MOUNT_MS })
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
      /**
       * Did the scan give up rather than finish?
       *
       * The product marks this when its fail-open wrapper catches — which on a slow
       * worker means the RPC deadline fired and the check was journalled as unfinished.
       * From outside, that looks identical to a broken relay: no banner either way. This
       * is the fact that separates them (B-78).
       */
      gaveUp: performance.getEntriesByName('okolos:scan-failed').length > 0,
      /**
       * Did the walk stop before anything was asked?
       *
       * The third state, and the one this report got wrong. A truncated traversal with no
       * candidates sends no RPC at all — so "the verdict is what did not arrive" named a
       * link that was never reached. Four CI failures read that way before the cause was
       * measured: the collector's budget had a wall-clock component of eight milliseconds,
       * and on a loaded runner that fires on a seven-node page (B-110).
       */
      blinded: performance.getEntriesByName('okolos:scan-blinded').length > 0,
    }))
    lines.push(`  - page ${page_.url} (${page_.ready}), ${page_.nodes} nodes`)
    lines.push(
      page_.scanned === null
        ? '  - the content script never finished a scan: it did not run, or it threw'
        : `  - the content script scanned in ${page_.scanned.toFixed(1)} ms`,
    )
    if (page_.blinded) {
      lines.push(
        '  - the collector STOPPED SHORT and asked nothing: the traversal hit its ceiling',
      )
      lines.push(
        '    with no candidates, so no verdict was ever requested. Check the budget against',
      )
      lines.push('    the page — and against the load on this machine, if the ceiling is time.')
    } else if (page_.scanned !== null) {
      lines.push('  - the scan asked, so the verdict is what did not arrive')
    }
    if (page_.gaveUp) {
      /**
       * Then this is not a broken relay. The background did not answer inside
       * `RPC_TIMEOUT_MS`, the scan failed open and journalled "the check did not
       * finish", and no banner can appear after that however long the wait is — which
       * is why waiting longer is not the fix.
       */
      lines.push(
        '  - the scan GAVE UP: the background did not answer within the RPC deadline,',
      )
      lines.push(
        '    so the check was journalled as unfinished. A banner cannot arrive after that;',
      )
      lines.push('    this is the product degrading honestly on a worker that was too slow.')
    }
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

/**
 * Waits for a line to appear in the journal, reloading the screen on each attempt.
 *
 * **The journal screen is a snapshot taken when it opens, not a live view** — which is
 * right for a journal and wrong to assume in a test. A locator assertion re-reads the DOM
 * of a page that was rendered before the row existed, so it retries for its whole budget
 * against markup that cannot change, and reports the empty state as the received value.
 *
 * The class has now cost two failures. `scn-036` hit it locally, roughly one run in four,
 * and was fixed there in isolation; `budget.spec.ts` hit it on CI two hours later — the
 * sibling nobody swept for. Hence a helper rather than a third copy: the second occurrence
 * is where a fix stops being a fix and becomes a rule.
 *
 * `text` is matched as a substring, so a caller may pass the opening of a sentence rather
 * than a whole message — a message with substitutions has no single rendered form.
 */
export async function expectJournalLine(
  journal: Page,
  text: string,
  timeoutMs = RECORD_VISIBLE_MS,
): Promise<void> {
  await expect
    .poll(
      async () => {
        await journal.reload()
        return journal.locator('[data-role=journal]').innerText()
      },
      { timeout: timeoutMs },
    )
    .toContain(text)
}

