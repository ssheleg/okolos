/**
 * Shadow-root mode for in-page surfaces.
 *
 * Production is always `closed`: a page that could reach into the warning
 * about itself could hide it. But the same property blocks Playwright, so the
 * click path from banner to inspector could only ever be asserted by unit
 * tests — the gap recorded as REQ-35.
 *
 * The build defines this flag as `false` unless a test build asks otherwise,
 * and a bundle gate asserts the shipped artefact carries the closed mode. The
 * hook exists in one place rather than as a parameter every caller could get
 * wrong.
 */
declare const __OKOLOS_TEST_HOOKS__: boolean | undefined

export function shadowMode(): ShadowRootMode {
  return typeof __OKOLOS_TEST_HOOKS__ !== 'undefined' && __OKOLOS_TEST_HOOKS__ ? 'open' : 'closed'
}
