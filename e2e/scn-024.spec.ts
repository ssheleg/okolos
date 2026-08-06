import { expect, test } from './fixtures.js'

/**
 * SCR-12's trusted list, end to end.
 *
 * The comparison view tells the user, in those words, that marking a site
 * legitimate "can be undone in settings". Until this list existed that was
 * false: trust was granted in one click from a page and could not be taken back
 * through the interface at all.
 */

async function seedTrust(page: import('@playwright/test').Page, domain: string): Promise<void> {
  await page.evaluate(async (host) => {
    const open = indexedDB.open('okolos')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const tx = db.transaction(['exceptions'], 'readwrite')
    tx.objectStore('exceptions').put({
      scope: 'domain',
      ref: host,
      createdAt: '2026-08-05T12:34:56.000Z',
      reason: 'marked legitimate by the user',
    })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, domain)
}

test('an untouched profile says nothing is trusted, and why the list would fill', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await expect(page.locator('[data-role=trusted-empty]')).toContainText('have not marked any site')
  await expect(page.locator('[data-role=trusted-row]')).toHaveCount(0)
})

test('a trusted site is listed with when and why, and can be taken back', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await seedTrust(page, 'g00gle.com')
  await page.reload()

  const row = page.locator('[data-role=trusted-row][data-domain="g00gle.com"]')
  await expect(row).toHaveCount(1)
  await expect(row.locator('[data-role=granted]')).toContainText('2026-08-05')
  await expect(row.locator('[data-role=granted]')).toContainText('marked legitimate')

  await row.locator('[data-role=revoke]').click()

  // Gone from the list, and gone from storage — a revocation that only repaints
  // is the same bug as no revocation at all.
  await expect(page.locator('[data-role=trusted-row]')).toHaveCount(0)
  const stored = await page.evaluate(async () => {
    const open = indexedDB.open('okolos')
    const db = await new Promise<IDBDatabase>((resolve) => {
      open.onsuccess = () => resolve(open.result)
    })
    const tx = db.transaction(['exceptions'], 'readonly')
    const all = await new Promise<unknown[]>((resolve) => {
      const request = tx.objectStore('exceptions').getAll()
      request.onsuccess = () => resolve(request.result as unknown[])
    })
    db.close()
    return all.length
  })
  expect(stored).toBe(0)
})
