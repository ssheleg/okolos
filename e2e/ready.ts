import type { BrowserContext, Worker } from '@playwright/test'

import { WORKER_REGISTER_MS } from './budgets.js'

/**
 * The extension's service worker, waited for once and in one place.
 *
 * **Why the wait belongs to the context and not to whoever remembers it.** Both harnesses
 * kept this wait inside their `extensionId` fixture, so a spec that never asked for the id
 * navigated the moment the browser was up — and fourteen spec files do exactly that,
 * including every in-page-surface spec and the one file that measures cold start. Content
 * scripts are declared for future navigations, so a tab opened before the extension is
 * registered runs none of this product's code, produces no banner, logs nothing, and never
 * recovers: from outside it is indistinguishable from a broken detector.
 *
 * Whether that race is what reddened CI three times for a banner that never arrived
 * (B-65 twice, B-108 once) is **not proven** — ten launches on an idle machine hit it zero
 * times, and the runner is where it would show. What is measured is the hole: fourteen
 * files never waited, and the two that failed are among them. Closing it costs a wait
 * those specs mostly paid already.
 *
 * `cold-start.spec.ts` opts out through the `coldWorker` option, because a booted worker is
 * exactly what it must not have.
 */
export async function extensionWorker(context: BrowserContext): Promise<Worker> {
  const [existing] = context.serviceWorkers()
  if (existing) return existing

  /**
   * A named wait with its own sentence, because the unnamed one blamed the fixture.
   * Running out of the per-test timeout here printed "Test timeout of 30000ms exceeded
   * while setting up extensionId" — which sends the reader to look for a broken fixture,
   * when the fact is that the worker had not registered yet on a loaded machine.
   */
  return context.waitForEvent('serviceworker', { timeout: WORKER_REGISTER_MS }).catch(() => {
    throw new Error(
      `the extension's service worker did not register within ` +
        `${WORKER_REGISTER_MS / 1000}s — the extension may have failed to load, or this ` +
        `machine is busy enough that a fresh browser plus an extension load takes longer`,
    )
  })
}
