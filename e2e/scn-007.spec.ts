import { expect, serve, test } from './fixtures.js'

/**
 * SCN-007 — a known-malicious page is stopped before it renders, and the user
 * can see on whose authority.
 *
 * The assertion that matters is not that a warning appeared: it is that the
 * page's own markup never reached the document. A block after render is a block
 * whose scripts have already run.
 */

const PAGE = `<!doctype html>
<html><body><h1 id="payload">Enter your bank password</h1></body></html>`

/** Seeds a verified feed and installs the rules the background builds from it. */
async function seedFeed(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    const open = indexedDB.open('okolos')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const tx = db.transaction(['feeds'], 'readwrite')
    tx.objectStore('feeds').put({
      name: 'phishing',
      version: 1,
      updatedAt: new Date().toISOString(),
      storedAt: new Date().toISOString(),
      entries: ['fixture.test'],
    })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })
}

/**
 * Waits until the rule for the domain this file is about is installed.
 *
 * The earlier version waited for `getDynamicRules()` to return anything at all,
 * on the theory that the rules were committed but the network stack had not
 * picked them up yet. Measured, that theory was wrong — and the truth was
 * worse. A probe that installed the rules and navigated immediately, twenty
 * times over, blocked on the first round and failed on every round after it,
 * with the rule set no longer naming `fixture.test` at all: it named
 * `sberbank-online-vhod.test` and three other domains from the *published*
 * feed. The extension pulls that feed from the production worker at every
 * service-worker boot, and it was replacing what the test had seeded.
 *
 * So the wait was satisfied by the wrong rules. It now asks the only question
 * that means anything here — is the domain this file is about actually
 * covered — and the fixture no longer lets the suite reach the internet at all.
 */
async function rulesInstalled(seeder: import('@playwright/test').Page): Promise<void> {
  await seeder.evaluate(async () => {
    await chrome.runtime.sendMessage({ v: 1, type: 'rules/refresh', payload: {} })
  })
  const deadline = Date.now() + 10_000
  let matching = 0
  while (matching === 0) {
    matching = await seeder.evaluate(async () => {
      const rules = await chrome.declarativeNetRequest.getDynamicRules()
      return rules.filter((rule) => rule.condition.urlFilter?.includes('fixture.test')).length
    })
    if (matching === 0 && Date.now() > deadline) {
      const rules = await seeder.evaluate(
        async () => JSON.stringify(await chrome.declarativeNetRequest.getDynamicRules()),
      )
      throw new Error(`no rule for fixture.test was installed. What is installed: ${rules}`)
    }
    if (matching === 0) await seeder.waitForTimeout(100)
  }
}

test('the flagged page never renders, and the block names its source', async ({
  context,
  extensionId,
}) => {
  await serve(context, PAGE)

  const seeder = await context.newPage()
  await seeder.goto(`chrome-extension://${extensionId}/options.html`)
  await seedFeed(seeder)

  // The worker rebuilds its rules from the feed on demand.
  await rulesInstalled(seeder)

  const page = await context.newPage()
  await page.goto('https://fixture.test/login')

  await expect(page.locator('[data-role=interstitial]')).toHaveCount(1)
  // The page's own markup never arrived.
  await expect(page.locator('#payload')).toHaveCount(0)
  // The name, not the identifier. Asserting `phishing` here was the test
  // agreeing with the defect: it is the key the feed is stored under, and a
  // site owner reading it has been handed a database column as a reason.
  await expect(page.locator('[data-role=source]')).toContainText('Okolos phishing list')
})

test('continuing is remembered, so the user is not asked twice', async ({
  context,
  extensionId,
}) => {
  await serve(context, PAGE)

  const seeder = await context.newPage()
  await seeder.goto(`chrome-extension://${extensionId}/options.html`)
  await seedFeed(seeder)
  await rulesInstalled(seeder)

  const page = await context.newPage()
  await page.goto('https://fixture.test/login')
  await expect(page.locator('[data-role=interstitial]')).toHaveCount(1)

  await page.locator('[data-role=continue]').click()
  await expect(page.locator('#payload')).toHaveCount(1)

  // And again, from a fresh navigation: the exception is stored, not in memory.
  const second = await context.newPage()
  await second.goto('https://fixture.test/login')
  await expect(second.locator('#payload')).toHaveCount(1)
})

test('"I own this site" opens the public status page for the domain that was blocked', async ({
  context,
  extensionId,
}) => {
  /**
   * The wiring, not the helper. `appealLinkFor` had unit tests from the moment
   * it existed; the button next to it opened `options.html#appeal` — an
   * extension page with no appeal section, at a hash that matched nothing.
   * Only a click reaches the line that chooses the destination.
   */
  await serve(context, PAGE)

  const seeder = await context.newPage()
  await seeder.goto(`chrome-extension://${extensionId}/options.html`)
  await seedFeed(seeder)
  await rulesInstalled(seeder)

  const page = await context.newPage()
  await page.goto('https://fixture.test/login')
  await expect(page.locator('[data-role=interstitial]')).toHaveCount(1)

  const opened = context.waitForEvent('page')
  await page.locator('[data-role=owner]').click()
  const status = await opened

  const url = new URL(status.url())
  expect(url.pathname).toBe('/status')
  expect(url.searchParams.get('domain')).toBe('fixture.test')
  // The path of the blocked URL carried a route the service has no business with.
  expect(status.url()).not.toContain('/login')
  expect(status.url()).not.toContain('options.html')
})
