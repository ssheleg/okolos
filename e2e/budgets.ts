/**
 * How long a test may wait for a surface to appear, in one place.
 *
 * Ten seconds was written into thirteen spec files and measured nowhere. It has
 * now produced two failures on CI that had nothing to do with what the tests were
 * about: four checks in `scn-010.spec.ts` on 2026-08-20, and one in
 * `hostile-page.spec.ts` the same night — the latter a test whose subject is
 * whether a page can hide the warning with a CSS custom property, failing because
 * the banner had not appeared within ten seconds on a shared runner.
 *
 * Every one of these tests takes a **fresh browser with the extension loaded**:
 * the `context` fixture launches a persistent context per test. So the wait
 * covers a browser launch, an extension load, a service-worker boot, a page load,
 * a DOM scan, an RPC to the worker and a mount — and none of that is what the
 * assertions above it are checking.
 *
 * **This is not a ceiling on the product's latency.** It is the point past which
 * a test stops waiting, and it is deliberately generous so that a slow runner
 * cannot make a CSS test fail. What the product's real budget is, and what it
 * should be on a cold worker, is unmeasured — recorded as B-65, and raising this
 * number does not answer it. Masking a race with a longer wait is what this
 * project's own retrospective forbids (B-18); this is not a race. The receiver is
 * not failing, the work simply takes time, and the failures above were the wait
 * being shorter than the work.
 *
 * **It must also be longer than the product's own deadline, and it was shorter.**
 * `RPC_TIMEOUT_MS` is 30 s: that is how long the extension itself allows a worker to
 * answer before calling the call failed. At 20 s this budget gave up **ten seconds
 * before the product would have** — so a worker that was merely slow produced
 * "44 × locator resolved to 0 elements" and no way to tell that from a product
 * failure. That is exactly the shape of the `scn-010` failure on `d91426b`: 20.6 s,
 * one test out of five in its file, with `workers: 1` and no parallelism to blame.
 *
 * The order below is asserted by `tools/budgets.test.ts`, because three numbers in
 * three files drift into an inversion the moment one of them is tuned alone:
 *
 *     RPC_TIMEOUT_MS  <  SURFACE_MOUNT_MS  and  WORKER_REGISTER_MS + SURFACE_MOUNT_MS  <  test timeout
 *
 * A failure then means the product failed, not that the test stopped watching.
 */
export const SURFACE_MOUNT_MS = 35_000

/**
 * How long the `extensionId` fixture waits for the service worker to register.
 *
 * `waitForEvent('serviceworker')` had no budget of its own, so it inherited the
 * 30 s per-test timeout — and when it ran out, Playwright reported *"Test timeout
 * of 30000ms exceeded while setting up extensionId"* over
 * `browserContext.waitForEvent: Target page, context or browser has been closed`.
 * That reads as a broken fixture. It is not: it is a worker that had not booted
 * yet. Observed 2026-08-20 on `scn-030.spec.ts` with a unit suite running on the
 * same machine — the same spec passes alone in 563 ms.
 *
 * Below the test timeout on purpose, so the failure is this wait running out, with
 * a sentence naming what did not happen, rather than a timeout naming nothing.
 */
export const WORKER_REGISTER_MS = 20_000
