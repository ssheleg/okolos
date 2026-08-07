# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scn-015.spec.ts >> a source that cannot run is named, and the total says it may be incomplete
- Location: e2e/scn-015.spec.ts:54:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('[data-role=leaks] [data-role=coverage]')
Expected substring: "Have I Been Pwned"
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" with timeout 15000ms
  - waiting for locator('[data-role=leaks] [data-role=coverage]')

```

```yaml
- main:
  - heading "What left this device" [level=1]
  - paragraph: Nothing has been sent from this device.
  - heading "What changed since last time" [level=1]
  - paragraph: Nothing to show yet — this is your first check.
  - button "Show full history"
  - paragraph: Anything older than 90 days is deleted.
  - textbox "you@example.com"
  - heading "What has leaked" [level=1]
  - paragraph: Nothing has been looked up yet. Checking sends a hashed form of your address, never the address itself.
  - button "Check now"
  - paragraph: Breach data from Have I Been Pwned, used under CC BY 4.0.
  - heading "What needs you" [level=1]
  - paragraph: Nothing needs you right now.
  - heading "What changed in your extensions" [level=1]
  - paragraph: Nothing has changed since the last check.
  - heading "Inspect a package" [level=2]
  - paragraph: No browser hands one extension another’s code, so nothing here can be analysed on its own. Choose a package you downloaded and it is read on this device — nothing is uploaded.
  - text: Choose a package file
  - button "Choose a package file"
  - heading "Installed (0)" [level=2]
  - heading "Sites you marked legitimate" [level=1]
  - paragraph: You have not marked any site as legitimate. When you do, it will be listed here and you can take it back.
  - heading "Your data" [level=2]
  - paragraph: Everything is stored on this device. Take a copy, or delete all of it — no account is involved either way.
  - button "Export all data"
  - button "Delete all data"
```

# Test source

```ts
  1   | import { expect, test } from './fixtures.js'
  2   | 
  3   | /**
  4   |  * SCN-015 and SCN-016 — the leak inventory, and the coverage line that gives
  5   |  * its number a meaning.
  6   |  *
  7   |  * No API key is configured in a test profile, which is exactly the interesting
  8   |  * case: one source cannot run, and the panel has to say so rather than quietly
  9   |  * reporting a smaller number.
  10  |  *
  11  |  * Every outbound host is stubbed for the whole file, on the context rather than
  12  |  * the page — the lookup is made by the service worker, which `page.route` never
  13  |  * sees. Before this, two tests reached the real Cavalier API: they were slow,
  14  |  * failed roughly one run in four, and sent an invented address to a third party
  15  |  * on every green run as well.
  16  |  *
  17  |  * Stubbing alone did not steady them. Two handlers on the same URL — a
  18  |  * file-wide one and a per-test override — leave the answer depending on
  19  |  * registration order, and one run in four got the wrong body. There is exactly
  20  |  * one route now, and a test that needs a different answer sets the body rather
  21  |  * than adding a second handler.
  22  |  *
  23  |  * The other half of the fix is in the product: every source has a deadline now,
  24  |  * so a silent one is reported as unreachable instead of holding the panel open
  25  |  * forever.
  26  |  *
  27  |  * The two tests that wait on a lookup are given their own budget. The suite's
  28  |  * default is 30 seconds, and a check that legitimately allows a source 10 to
  29  |  * answer does not fit inside it once the context launch is counted — which is
  30  |  * why these were steady alone and failed one run in four in the full suite. The
  31  |  * assertion timeouts stay modest so a real failure still reports as one.
  32  |  */
  33  | 
  34  | /** The body the single Cavalier stub returns. A test that needs another sets it. */
  35  | let cavalierBody = '{"stealers":[]}'
  36  | test.beforeEach(async ({ context }) => {
  37  |   cavalierBody = '{"stealers":[]}'
  38  |   await context.route('https://cavalier.hudsonrock.com/**', (route) =>
  39  |     route.fulfill({ status: 200, contentType: 'application/json', body: cavalierBody }),
  40  |   )
  41  |   await context.route('https://haveibeenpwned.com/**', (route) =>
  42  |     route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
  43  |   )
  44  | })
  45  | 
  46  | test('the panel says what will be sent before anything is', async ({ context, extensionId }) => {
  47  |   const page = await context.newPage()
  48  |   await page.goto(`chrome-extension://${extensionId}/options.html`)
  49  | 
  50  |   await expect(page.locator('[data-role=leaks] [data-role=idle]')).toContainText('hashed form')
  51  |   await expect(page.locator('[data-role=leaks] [data-role=total]')).toHaveCount(0)
  52  | })
  53  | 
  54  | test('a source that cannot run is named, and the total says it may be incomplete', async ({
  55  |   context,
  56  |   extensionId,
  57  | }) => {
  58  |   test.slow()
  59  |   const page = await context.newPage()
  60  |   await page.goto(`chrome-extension://${extensionId}/options.html`)
  61  | 
  62  |   await page.locator('[data-role=address]').fill('someone@example.test')
  63  |   await page.locator('[data-role=leaks] [data-role=check]').click()
  64  | 
  65  |   const coverage = page.locator('[data-role=leaks] [data-role=coverage]')
> 66  |   await expect(coverage).toContainText('Have I Been Pwned', { timeout: 15_000 })
      |                          ^ Error: expect(locator).toContainText(expected) failed
  67  |   await expect(coverage).toContainText('may be incomplete')
  68  | })
  69  | 
  70  | test('the credit for the data is on the page that shows it', async ({ context, extensionId }) => {
  71  |   // CC BY 4.0 asks for attribution wherever the data appears. This is where it
  72  |   // appears; a README is not.
  73  |   const page = await context.newPage()
  74  |   await page.goto(`chrome-extension://${extensionId}/options.html`)
  75  | 
  76  |   const attribution = page.locator('[data-role=leaks] [data-role=attribution]')
  77  |   await expect(attribution).toContainText('Have I Been Pwned')
  78  |   await expect(attribution).toContainText('CC BY 4.0')
  79  | })
  80  | 
  81  | test('a recent infection is separated from an old breach, and each carries its repair', async ({
  82  |   context,
  83  |   extensionId,
  84  | }) => {
  85  |   test.slow()
  86  |   // The two piles need different responses: cookies survive a password change.
  87  |   // A single date-sorted list makes the infection look like a newer breach.
  88  |   // Sets the single stub's body rather than adding a second handler on the same
  89  |   // URL — that was the race.
  90  |   cavalierBody = JSON.stringify({ stealers: [{ date_compromised: new Date().toISOString() }] })
  91  | 
  92  |   const page = await context.newPage()
  93  |   await page.goto(`chrome-extension://${extensionId}/options.html`)
  94  | 
  95  |   await page.locator('[data-role=address]').fill('someone@example.test')
  96  |   await page.locator('[data-role=leaks] [data-role=check]').click()
  97  | 
  98  |   const fresh = page.locator('[data-role=leak-group][data-urgency=fresh-infostealer]')
  99  |   await expect(fresh).toHaveCount(1, { timeout: 15_000 })
  100 |   await expect(fresh.locator('[data-role=group-why]')).toContainText('session cookies')
  101 | 
  102 |   // Cavalier names no site, so the panel says so instead of guessing a login page.
  103 |   await expect(fresh.locator('[data-role=no-domain]')).toContainText('nowhere to send you')
  104 |   await expect(fresh.locator('[data-role=check-reuse]')).toHaveCount(1)
  105 |   await expect(fresh.locator('[data-role=resolve]')).toHaveText('Mark resolved')
  106 | })
  107 | 
```