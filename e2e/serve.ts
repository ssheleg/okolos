import type { BrowserContext } from '@playwright/test'

/**
 * Several origins, each with its own document.
 *
 * `serve` answers every path with one body, which is right for a single page and
 * useless for a frame: an embedded document has to come from a different origin for
 * the browser to give it its own frame id, and that id is what tells a subframe from
 * the top one. Keyed by host so a test reads as "this page embeds that one".
 *
 * **Its own module because there are two harnesses and both need it.** `fixtures.ts`
 * loads `dist/chrome` and `hooks.ts` loads `dist/chrome-e2e`, and each refuses at import
 * time if its own build is stale (B-42). A spec on the hooked build that imported this
 * from `fixtures.ts` would be gated on the staleness of a build it never loads — green or
 * red for a reason that has nothing to do with it. Nothing here touches either build, so
 * it belongs to neither.
 */
export async function serveHosts(
  context: BrowserContext,
  bodies: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [host, html] of Object.entries(bodies)) {
    await context.route(`https://${host}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
    )
  }
}
