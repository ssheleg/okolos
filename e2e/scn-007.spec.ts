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

test('the flagged page never renders, and the block names its source', async ({
  context,
  extensionId,
}) => {
  await serve(context, PAGE)

  const seeder = await context.newPage()
  await seeder.goto(`chrome-extension://${extensionId}/options.html`)
  await seedFeed(seeder)

  // The worker rebuilds its rules from the feed on demand.
  await seeder.evaluate(async () => {
    await chrome.runtime.sendMessage({ v: 1, type: 'rules/refresh', payload: {} })
  })

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
  await seeder.evaluate(async () => {
    await chrome.runtime.sendMessage({ v: 1, type: 'rules/refresh', payload: {} })
  })

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
