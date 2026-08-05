import { expect, test } from './fixtures.js'

/**
 * SCN-019 — the user asks what left the device and gets an answer they can
 * check. On a fresh profile nothing has been sent, and the panel must say so
 * in a sentence rather than showing an empty table.
 */

test('an untouched install says plainly that nothing was sent', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await expect(page.getByText('What left this device')).toBeVisible()
  await expect(page.getByText('Nothing has been sent from this device.')).toBeVisible()
})

test('the panel never shows an empty list in place of a failure', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await expect(page.getByText('Nothing has been sent from this device.')).toBeVisible()

  // Whatever the state, an entries list must not appear without entries: an
  // empty table reads as "nothing was sent", which is a claim the product is
  // only allowed to make when it actually knows it.
  await expect(page.locator('[data-role=entries]')).toHaveCount(0)
})
