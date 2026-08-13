import type { BrowserContext } from '@playwright/test'

import { expect, test } from './fixtures.js'

/**
 * SCN-027, SCN-028, SCN-030 — the overview, in a browser rather than in a diff.
 *
 * The unit tests hand the renderer a state and read the tree it returns. That
 * proves the renderer agrees with the test. It cannot prove that the page
 * assembles a real state from eight real reads, that an address opens the area
 * it names, or that an address nobody knows says so — all three of which were
 * broken in the shipped product and none of which a renderer test can see.
 */

const open = async (context: BrowserContext, extensionId: string, hash = '') => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html${hash}`)
  return page
}

test('SCN-027 — the overview lists every area with a state, before anything is opened', async ({
  context,
  extensionId,
}) => {
  const page = await open(context, extensionId)

  await expect(page.locator('[data-role=overview]')).toHaveCount(1)
  // Eight areas, each a real link. Not seven: a missing row is an area the
  // user cannot reach from the page that exists to reach them.
  await expect(page.locator('[data-role=area]')).toHaveCount(8)
  await expect(page.locator('[data-role=area-link]')).toHaveCount(8)

  for (const area of ['queue', 'journal', 'leaks', 'extensions', 'trusted', 'recovery', 'audit', 'data']) {
    const state = page.locator(`[data-area=${area}] [data-role=area-state]`)
    await expect(state, `${area} has no state line`).toHaveCount(1)
    // Never an unresolved catalogue key: the fallback is `[key]`, on purpose,
    // and it is what a missing string looks like on a live page.
    await expect(state).not.toContainText('[')
  }
})

test('SCN-027 — a fresh profile says nothing needs you, and says since when', async ({
  context,
  extensionId,
}) => {
  const page = await open(context, extensionId)

  await expect(page.locator('[data-role=attention-empty]')).toHaveCount(1)
  // "Nothing needs you" without a time beside it is the most damaging sentence
  // this product can say, because it is indistinguishable from never looking.
  const checked = page.locator('[data-role=attention-checked]')
  await expect(checked).toHaveCount(1)
  await expect(checked).not.toHaveText('')
})

test('SCN-028 — an area link opens that area, and back returns to the overview', async ({
  context,
  extensionId,
}) => {
  const page = await open(context, extensionId)

  await page.locator('[data-area=trusted] [data-role=area-link]').click()
  await expect(page.locator('[data-role=trusted]')).toHaveCount(1)
  // One area at a time: the overview is gone, not scrolled past.
  await expect(page.locator('[data-role=overview]')).toHaveCount(0)

  // The browser's own back, because the areas are real links and nothing here
  // reimplements history.
  await page.goBack()
  await expect(page.locator('[data-role=overview]')).toHaveCount(1)
})

test('SCN-028 — an address nobody understands opens the overview and names itself', async ({
  context,
  extensionId,
}) => {
  // The whole defect in one test. `options.html#journal` was produced from two
  // call sites and read by none, and the page opened silently at the top — so
  // the link looked exactly like a link that had worked.
  const page = await open(context, extensionId, '#settings')

  await expect(page.locator('[data-role=overview]')).toHaveCount(1)
  await expect(page.locator('[data-role=overview-unrecognised]')).toContainText('#settings')
})

test('SCN-028 — every address the product produces opens its own area', async ({
  context,
  extensionId,
}) => {
  // Walked here rather than asserted from the table, because the table already
  // agrees with itself. This asks the built page.
  const areas: Array<[string, string]> = [
    ['#queue', 'queue-section'],
    ['#journal', 'journal'],
    ['#leaks', 'leaks'],
    ['#extensions', 'extensions'],
    ['#trusted', 'trusted'],
    ['#audit', 'self-audit'],
    ['#data', 'data-controls'],
    ['#recovery=pasted-command', 'recovery'],
  ]

  for (const [hash, role] of areas) {
    const page = await open(context, extensionId, hash)
    await expect(page.locator(`[data-role=${role}]`), `${hash} did not open ${role}`).toHaveCount(1)
    await expect(page.locator('[data-role=overview-unrecognised]'), hash).toHaveCount(0)
    await page.close()
  }
})

test('SCN-029 — leaving an area carries how much is still waiting', async ({
  context,
  extensionId,
}) => {
  const page = await open(context, extensionId)
  await page.locator('[data-area=audit] [data-role=area-link]').click()

  const back = page.locator('[data-role=back]')
  await expect(back).toHaveCount(1)
  // The count is the point. This shape shows the overview only when you are on
  // it, so without the number here a person acting inside one area cannot tell
  // whether anything else is outstanding.
  await expect(back).not.toHaveText('')
  await back.click()
  await expect(page.locator('[data-role=overview]')).toHaveCount(1)
})
