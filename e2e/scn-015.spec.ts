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

/**
 * Reads the panel and turns a timeout into a diagnosis.
 *
 * This file has carried an intermittent failure that always looked the same —
 * a fifteen-second wait for an element that never came — and said nothing
 * about which of several causes produced it. The three are now
 * distinguishable from the DOM alone, without logging, which matters because
 * logging inside the product moves the race it is meant to observe:
 *
 * - `needs`   — the check was pressed with no usable address in the field;
 * - `status`  — the check started and the answer never arrived;
 * - `idle` with neither — the press never reached the handler at all.
 */
async function diagnose(page: import('@playwright/test').Page): Promise<string> {
  const state = await page.evaluate(() => {
    const panel = document.querySelector('[data-role=leaks]')
    const has = (role: string) => panel?.querySelector(`[data-role=${role}]`) !== null
    const fields = [...document.querySelectorAll('[data-role=address]')]
    const field = fields[0]
    return {
      needs: has('needs'),
      checking: has('status'),
      idle: has('idle'),
      ready: has('coverage'),
      address: field instanceof HTMLInputElement ? field.value : '(no field)',
      // More than one means the page module was evaluated twice, and the
      // button the click reached belongs to a different copy than the field
      // the fill bound to. Counted because it is the one remaining explanation
      // for a stable node holding nothing after a fill that reported success.
      fieldCount: fields.length,
      panels: document.querySelectorAll('[data-role=leaks]').length,
    }
  })
  const where = `field held "${state.address}", ${state.fieldCount} field(s), ${state.panels} panel(s)`
  if (state.needs) return `the check was refused for want of an address (${where})`
  if (state.checking) return `the check started and never answered (${where})`
  if (state.ready) return 'the check finished but the expected group is absent — a product bug, not a race'
  if (state.idle) return `the panel never left idle: the press did not reach the handler (${where})`
  return `the leaks panel is not on the page at all (${where})`
}

/** Awaits an assertion and, if it times out, says what the page was doing. */
async function expectWithDiagnosis(
  page: import('@playwright/test').Page,
  assertion: Promise<void>,
): Promise<void> {
  try {
    await assertion
  } catch (cause) {
    const why = await diagnose(page)
    throw new Error(`${String(cause).split('\n')[0]}\n\nDiagnosis: ${why}`)
  }
}

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

  // The second test that held the false claim steady. It asserted the word
  // "hashed" about a check that sends the address itself, and the unit test
  // one layer down asserted the same. Two tests agreeing on a lie read exactly
  // like two tests agreeing on a truth.
  const idle = page.locator('[data-role=leaks] [data-role=idle]')
  await expect(idle).toContainText('sends your address')
  await expect(idle).not.toContainText('hashed form')
  await expect(idle, 'the password check is separate and is the hashed one').toContainText(
    'partial hash',
  )
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
  await expectWithDiagnosis(
    page,
    expect(coverage).toContainText('Have I Been Pwned', { timeout: 15_000 }),
  )
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
  await expectWithDiagnosis(page, expect(fresh).toHaveCount(1, { timeout: 15_000 }))
  await expect(fresh.locator('[data-role=group-why]')).toContainText('session cookies')

  // Cavalier names no site, so the panel says so instead of guessing a login page.
  await expect(fresh.locator('[data-role=no-domain]')).toContainText('nowhere to send you')
  await expect(fresh.locator('[data-role=check-reuse]')).toHaveCount(1)
  await expect(fresh.locator('[data-role=resolve]')).toHaveText('Mark resolved')
})

test('the address field survives a repaint instead of being rebuilt', async ({
  context,
  extensionId,
}) => {
  // The regression behind three days of flake. This page repaints wholesale,
  // and each repaint awaits several database reads, so it takes real time
  // while the page is live. Rebuilding the input threw away whatever was typed
  // during that window — value, caret, focus, and any IME composition — and
  // the check clicked afterwards read an empty address and returned in
  // silence.
  //
  // Asserted on node identity rather than on the value, because a rebuilt
  // field that happens to be repopulated from the right variable would pass a
  // value check while still dropping focus and the caret.
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  const field = page.locator('[data-role=address]')
  await expect(field).toHaveCount(1)
  await page.evaluate(() => {
    document.querySelector('[data-role=address]')?.setAttribute('data-identity', 'original')
  })

  await field.fill('someone@example.test')

  // The journal's history toggle calls the same full reload the leak check
  // does — loading paint, database reads, second paint — with no network in
  // it, so this asserts the swap without waiting on a source. A check would
  // have worked too, but its "checking" state lasts a single frame against a
  // stubbed source and its result depends on the network path this test is not
  // about.
  await page.locator('[data-role=journal] [data-role=history]').click()
  await expect(page.locator('[data-role=journal] [data-role=history]')).toBeVisible()

  await expect(page.locator('[data-role=address][data-identity=original]')).toHaveCount(1)
  await expect(field).toHaveValue('someone@example.test')
})

test('pressing Check now with nothing typed says so, instead of nothing', async ({
  context,
  extensionId,
}) => {
  // Two things at once. It is the behaviour a user meets when they press the
  // button too early — and it is the reason the flake in this file cost three
  // days: a check that could not run left the page identical to how it
  // started, so every failure looked like the starting state and said nothing
  // about which of a dozen causes it was.
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await page.locator('[data-role=leaks] [data-role=check]').click()

  await expect(page.locator('[data-role=leaks] [data-role=needs]')).toContainText(
    'Enter the email address',
  )
  // And the refusal is recoverable: the control is still there.
  await expect(page.locator('[data-role=leaks] [data-role=check]')).toBeVisible()
})

test('an address that is not one is refused by name', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await page.locator('[data-role=address]').fill('not-an-address')
  await page.locator('[data-role=leaks] [data-role=check]').click()

  await expect(page.locator('[data-role=leaks] [data-role=needs]')).toContainText(
    'does not look like an email address',
  )
})
