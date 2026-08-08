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
 * Waits until the blocking rules are actually installed.
 *
 * `rules/refresh` resolving means the background handled the message, not that
 * `declarativeNetRequest` has finished installing what it built. Navigating on
 * the strength of the message is a race, and under a full-suite load it is one
 * this file lost: the same three tests pass alone and one fails in the run.
 *
 * Asking the API what it holds is the readiness this test actually needs.
 */
async function rulesInstalled(seeder: import('@playwright/test').Page): Promise<void> {
  await seeder.evaluate(async () => {
    await chrome.runtime.sendMessage({ v: 1, type: 'rules/refresh', payload: {} })
  })
  const deadline = Date.now() + 10_000
  let installed = 0
  while (installed === 0) {
    installed = await seeder.evaluate(
      async () => (await chrome.declarativeNetRequest.getDynamicRules()).length,
    )
    if (installed === 0 && Date.now() > deadline) {
      throw new Error('the blocking rules never appeared')
    }
    if (installed === 0) await seeder.waitForTimeout(100)
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
  await expect(page.locator('[data-role=source]')).toContainText('phishing')
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
