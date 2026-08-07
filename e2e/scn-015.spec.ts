import { expect, test } from './fixtures.js'

/**
 * SCN-015 and SCN-016 — the leak inventory, and the coverage line that gives
 * its number a meaning.
 *
 * No API key is configured in a test profile, which is exactly the interesting
 * case: one source cannot run, and the panel has to say so rather than quietly
 * reporting a smaller number.
 *
 * Every outbound host is stubbed for the whole file, on the context rather than
 * the page — the lookup is made by the service worker, which `page.route` never
 * sees. Before this, two tests reached the real Cavalier API: they were slow,
 * failed roughly one run in four, and sent an invented address to a third party
 * on every green run as well.
 *
 * Stubbing alone did not steady them. Two handlers on the same URL — a
 * file-wide one and a per-test override — leave the answer depending on
 * registration order, and one run in four got the wrong body. There is exactly
 * one route now, and a test that needs a different answer sets the body rather
 * than adding a second handler.
 *
 * The other half of the fix is in the product: every source has a deadline now,
 * so a silent one is reported as unreachable instead of holding the panel open
 * forever.
 *
 * The two tests that wait on a lookup are given their own budget. The suite's
 * default is 30 seconds, and a check that legitimately allows a source 10 to
 * answer does not fit inside it once the context launch is counted — which is
 * why these were steady alone and failed one run in four in the full suite. The
 * assertion timeouts stay modest so a real failure still reports as one.
 */

/** The body the single Cavalier stub returns. A test that needs another sets it. */
let cavalierBody = '{"stealers":[]}'
test.beforeEach(async ({ context }) => {
  cavalierBody = '{"stealers":[]}'
  await context.route('https://cavalier.hudsonrock.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: cavalierBody }),
  )
  await context.route('https://haveibeenpwned.com/**', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
  )
})

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
  test.slow()
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await page.locator('[data-role=address]').fill('someone@example.test')
  await page.locator('[data-role=leaks] [data-role=check]').click()

  const coverage = page.locator('[data-role=leaks] [data-role=coverage]')
  await expect(coverage).toContainText('Have I Been Pwned', { timeout: 15_000 })
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

test('a recent infection is separated from an old breach, and each carries its repair', async ({
  context,
  extensionId,
}) => {
  test.slow()
  // The two piles need different responses: cookies survive a password change.
  // A single date-sorted list makes the infection look like a newer breach.
  // Sets the single stub's body rather than adding a second handler on the same
  // URL — that was the race.
  cavalierBody = JSON.stringify({ stealers: [{ date_compromised: new Date().toISOString() }] })

  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await page.locator('[data-role=address]').fill('someone@example.test')
  await page.locator('[data-role=leaks] [data-role=check]').click()

  const fresh = page.locator('[data-role=leak-group][data-urgency=fresh-infostealer]')
  await expect(fresh).toHaveCount(1, { timeout: 15_000 })
  await expect(fresh.locator('[data-role=group-why]')).toContainText('session cookies')

  // Cavalier names no site, so the panel says so instead of guessing a login page.
  await expect(fresh.locator('[data-role=no-domain]')).toContainText('nowhere to send you')
  await expect(fresh.locator('[data-role=check-reuse]')).toHaveCount(1)
  await expect(fresh.locator('[data-role=resolve]')).toHaveText('Mark resolved')
})
