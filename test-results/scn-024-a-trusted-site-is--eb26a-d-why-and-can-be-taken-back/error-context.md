# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scn-024.spec.ts >> a trusted site is listed with when and why, and can be taken back
- Location: e2e/scn-024.spec.ts:45:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('[data-role=trusted-row]')
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for locator('[data-role=trusted-row]')
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Test source

```ts
  1  | import { expect, test } from './fixtures.js'
  2  | 
  3  | /**
  4  |  * SCR-12's trusted list, end to end.
  5  |  *
  6  |  * The comparison view tells the user, in those words, that marking a site
  7  |  * legitimate "can be undone in settings". Until this list existed that was
  8  |  * false: trust was granted in one click from a page and could not be taken back
  9  |  * through the interface at all.
  10 |  */
  11 | 
  12 | async function seedTrust(page: import('@playwright/test').Page, domain: string): Promise<void> {
  13 |   await page.evaluate(async (host) => {
  14 |     const open = indexedDB.open('okolos')
  15 |     const db = await new Promise<IDBDatabase>((resolve, reject) => {
  16 |       open.onsuccess = () => resolve(open.result)
  17 |       open.onerror = () => reject(open.error)
  18 |     })
  19 |     const tx = db.transaction(['exceptions'], 'readwrite')
  20 |     tx.objectStore('exceptions').put({
  21 |       scope: 'domain',
  22 |       ref: host,
  23 |       createdAt: '2026-08-05T12:34:56.000Z',
  24 |       reason: 'marked legitimate by the user',
  25 |     })
  26 |     await new Promise<void>((resolve, reject) => {
  27 |       tx.oncomplete = () => resolve()
  28 |       tx.onerror = () => reject(tx.error)
  29 |     })
  30 |     db.close()
  31 |   }, domain)
  32 | }
  33 | 
  34 | test('an untouched profile says nothing is trusted, and why the list would fill', async ({
  35 |   context,
  36 |   extensionId,
  37 | }) => {
  38 |   const page = await context.newPage()
  39 |   await page.goto(`chrome-extension://${extensionId}/options.html`)
  40 | 
  41 |   await expect(page.locator('[data-role=trusted-empty]')).toContainText('have not marked any site')
  42 |   await expect(page.locator('[data-role=trusted-row]')).toHaveCount(0)
  43 | })
  44 | 
  45 | test('a trusted site is listed with when and why, and can be taken back', async ({
  46 |   context,
  47 |   extensionId,
  48 | }) => {
  49 |   const page = await context.newPage()
  50 |   await page.goto(`chrome-extension://${extensionId}/options.html`)
  51 |   await seedTrust(page, 'g00gle.com')
  52 |   await page.reload()
  53 | 
  54 |   const row = page.locator('[data-role=trusted-row][data-domain="g00gle.com"]')
  55 |   await expect(row).toHaveCount(1)
  56 |   await expect(row.locator('[data-role=granted]')).toContainText('2026-08-05')
  57 |   await expect(row.locator('[data-role=granted]')).toContainText('marked legitimate')
  58 | 
  59 |   await row.locator('[data-role=revoke]').click()
  60 | 
  61 |   // Gone from the list, and gone from storage — a revocation that only repaints
  62 |   // is the same bug as no revocation at all.
> 63 |   await expect(page.locator('[data-role=trusted-row]')).toHaveCount(0)
     |                                                         ^ Error: expect(locator).toHaveCount(expected) failed
  64 |   const stored = await page.evaluate(async () => {
  65 |     const open = indexedDB.open('okolos')
  66 |     const db = await new Promise<IDBDatabase>((resolve) => {
  67 |       open.onsuccess = () => resolve(open.result)
  68 |     })
  69 |     const tx = db.transaction(['exceptions'], 'readonly')
  70 |     const all = await new Promise<unknown[]>((resolve) => {
  71 |       const request = tx.objectStore('exceptions').getAll()
  72 |       request.onsuccess = () => resolve(request.result as unknown[])
  73 |     })
  74 |     db.close()
  75 |     return all.length
  76 |   })
  77 |   expect(stored).toBe(0)
  78 | })
  79 | 
```