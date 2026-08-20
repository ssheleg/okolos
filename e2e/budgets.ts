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
 * Kept under the per-test timeout in `playwright.config.ts` (30 s) so a blown
 * budget fails with the assertion's own message rather than as a timeout with
 * none.
 */
export const SURFACE_MOUNT_MS = 20_000
