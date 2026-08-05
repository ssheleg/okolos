import AxeBuilder from '@axe-core/playwright'

import { expect, test } from './fixtures.js'

/**
 * REQ-29 — accessibility, checked on the surfaces axe can actually reach.
 *
 * The in-page banner is deliberately out of reach: it lives in a closed shadow
 * root, and the same property that stops a hostile page from hiding the
 * warning stops an external scanner from auditing it. Its keyboard reachability,
 * alert role and text-carried severity are covered by unit tests in
 * packages/ui instead — stated here so nobody reads this file as full coverage.
 */

test('the self-audit page has no detectable accessibility violations', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await expect(page.getByText('What left this device')).toBeVisible()

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(results.violations).toEqual([])
})

test('the popup has no detectable accessibility violations', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(results.violations).toEqual([])
})
