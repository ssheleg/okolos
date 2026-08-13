import AxeBuilder from '@axe-core/playwright'

import { expect, test } from './fixtures.js'

/**
 * REQ-29 — accessibility, checked on the surfaces axe can actually reach.
 *
 * This file covers the four extension pages, and only those: it runs against
 * the production build, where the in-page surfaces live in a closed shadow
 * root that an external scanner cannot enter — the same property that stops a
 * hostile page from hiding the warning.
 *
 * The three surfaces that render over somebody else's page — SCR-03, SCR-04
 * and SCR-06 — are audited in a11y-overlays.spec.ts against the test-hook
 * build, on a page whose CSS is written to destroy them. Until that file
 * existed they had no accessibility coverage beyond unit tests, and this note
 * described the gap as permanent when REQ-35 had already made it closable.
 */

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/**
 * Every area of the extension's own page, swept one at a time.
 *
 * They used to render as one stack, so a single sweep of `options.html` covered
 * all of them at once. Since 2026-08-13 the address chooses the area and only
 * that area is in the document — which means a sweep of the overview says
 * nothing about the seven areas behind it. A new surface joins this sweep in
 * the change that creates it, and the dashboard created nine.
 */
const AREAS = [
  { hash: '', role: 'overview' },
  { hash: '#queue', role: 'queue-section' },
  { hash: '#journal', role: 'journal' },
  { hash: '#leaks', role: 'leaks' },
  { hash: '#extensions', role: 'extensions' },
  { hash: '#trusted', role: 'trusted' },
  { hash: '#audit', role: 'self-audit' },
  { hash: '#data', role: 'data-controls' },
] as const

for (const { hash, role } of AREAS) {
  test(`the ${role} area has no detectable accessibility violations`, async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/options.html${hash}`)
    // Waiting on the area itself, not on a timeout: a sweep of a page that has
    // not painted yet finds nothing wrong with nothing.
    await expect(page.locator(`[data-role=${role}]`)).toHaveCount(1)

    const results = await new AxeBuilder({ page }).withTags([...WCAG]).analyze()

    expect(results.violations).toEqual([])
  })
}

test('the popup has no detectable accessibility violations', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(results.violations).toEqual([])
})

test('the interstitial has no detectable accessibility violations', async ({
  context,
  extensionId,
}) => {
  // The page shown instead of someone's page. If any surface has to be
  // reachable by keyboard and screen reader, it is the one that replaced what
  // they were trying to look at.
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/interstitial.html`)
  await expect(page.locator('[data-role=interstitial]')).toHaveCount(1)

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(results.violations).toEqual([])
})

test('the recovery checklist has no detectable accessibility violations', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html#recovery=pasted-command`)
  await expect(page.locator('[data-role=recovery]')).toHaveCount(1)

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(results.violations).toEqual([])
})

test('the first-run screen has no detectable accessibility violations', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/first-run.html`)
  await expect(page.locator('[data-role=first-run]')).toHaveCount(1)

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(results.violations).toEqual([])
})
