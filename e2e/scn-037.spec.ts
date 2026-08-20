import { expect, test } from './hooks.js'
import { serveHosts } from './serve.js'
import { RECORD_VISIBLE_MS } from './budgets.js'

/**
 * The block page refuses to be somebody else's iframe.
 *
 * `interstitial.html` is the one file this extension makes web-accessible, because the
 * blocker redirects a tab to it — and web-accessible means any page can embed it. A framed
 * copy would be the product's own block page, with its own "continue anyway" control,
 * inside a document an attacker lays out. What that buys is narrow and real: the control
 * records an exception for the last blocked address, so a click stolen by an overlay turns
 * off a block the product had made.
 *
 * The page cannot be made to *name* an arbitrary site — it asks the background rather than
 * reading its own query string, which is a decision that predates this spec. A click is
 * enough on its own.
 */

const HOST = `<!doctype html>
<html><head><title>Host</title></head>
<body>
  <h1>An ordinary page</h1>
  <iframe id="framed" width="480" height="320"></iframe>
</body></html>`

test('refuses to render inside another page, and says why', async ({ context, extensionId }) => {
  await serveHosts(context, { 'host.test': HOST })
  const page = await context.newPage()
  await page.goto('https://host.test/')

  // Set from the page, the way an attacker would: the address is public by design.
  await page.evaluate((id) => {
    const frame = document.getElementById('framed') as HTMLIFrameElement
    frame.src = `chrome-extension://${id}/interstitial.html`
  }, extensionId)

  const framed = page.frameLocator('#framed')

  /**
   * The sentence is read from an extension page, not from this one: `chrome.i18n` exists
   * only in extension contexts and content scripts, and a first version asked the hostile
   * page for it and got `undefined`. Reading it here also keeps the assertion in whichever
   * language the browser actually picked, rather than in the one the spec guessed.
   */
  const reader = await context.newPage()
  await reader.goto(`chrome-extension://${extensionId}/interstitial.html`)
  const refusal = await reader.evaluate(() => chrome.i18n.getMessage('blockFramed'))
  await reader.close()
  expect(refusal.length, 'the catalogue has no sentence for the refusal').toBeGreaterThan(20)

  // The refusal is what renders, and it names who put the page there.
  await expect(framed.locator('#root')).toContainText(refusal.slice(0, 40), {
    timeout: RECORD_VISIBLE_MS,
  })

  /**
   * And none of the block page is drawn — not the control that matters. Asserted after the
   * refusal is on screen, so it cannot pass by the frame having failed to load at all.
   */
  await expect(framed.locator('[data-role=continue]')).toHaveCount(0)
  await expect(framed.locator('[data-role=back]')).toHaveCount(0)
})

test('still renders as a tab of its own', async ({ context, extensionId }) => {
  // Without this, the refusal above passes just as well against a page that renders
  // nothing at all, anywhere.
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/interstitial.html`)

  const refusal = await page.evaluate(() => chrome.i18n.getMessage('blockFramed'))
  expect(refusal.length).toBeGreaterThan(20)
  await expect(page.locator('#root')).not.toContainText(refusal.slice(0, 40))
  // The real page asks the background what was blocked; with nothing blocked it still
  // draws its own shell rather than the refusal.
  await expect(page.locator('#root')).not.toBeEmpty()
})
