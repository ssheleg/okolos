import { expect, test } from './fixtures.js'

/**
 * SCN-015 and SCN-016 — the leak inventory, and the coverage line that gives
 * its number a meaning.
 *
 * No API key is configured in a test profile, which is exactly the interesting
 * case: one source cannot run, and the panel has to say so rather than quietly
 * reporting a smaller number.
 */

test('the panel says what will be sent before anything is', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await expect(page.locator('[data-role=leaks] [data-role=idle]')).toContainText('hashed form')
  await expect(page.locator('[data-role=leaks] [data-role=total]')).toHaveCount(0)
})

test('a source that cannot run is named, and the total says it may be incomplete', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  // The lookup itself is blocked at the network boundary in a test profile;
  // what is asserted is the coverage reporting, which is the product claim.
  await page.route('https://cavalier.hudsonrock.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"stealers":[]}' }),
  )
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await page.locator('[data-role=address]').fill('someone@example.test')
  await page.locator('[data-role=leaks] [data-role=check]').click()

  const coverage = page.locator('[data-role=leaks] [data-role=coverage]')
  await expect(coverage).toContainText('Have I Been Pwned', { timeout: 10_000 })
  await expect(coverage).toContainText('may be incomplete')
})

test('the credit for the data is on the page that shows it', async ({ context, extensionId }) => {
  // CC BY 4.0 asks for attribution wherever the data appears. This is where it
  // appears; a README is not.
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  const attribution = page.locator('[data-role=leaks] [data-role=attribution]')
  await expect(attribution).toContainText('Have I Been Pwned')
  await expect(attribution).toContainText('CC BY 4.0')
})
