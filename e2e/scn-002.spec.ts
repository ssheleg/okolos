import { expect, test } from './fixtures.js'

/**
 * SCN-002 — the first run ends with something to do.
 *
 * The assertion that carries the scenario is the last one: whatever was found,
 * the user faces at most three things.
 */

async function seedFindings(page: import('@playwright/test').Page, count: number): Promise<void> {
  await page.evaluate(async (howMany) => {
    const open = indexedDB.open('okolos')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const tx = db.transaction(['findings'], 'readwrite')
    for (let i = 0; i < howMany; i += 1) {
      tx.objectStore('findings').put({
        id: `f${i}`,
        createdAt: '2026-08-05T00:00:00.000Z',
        subject: 'page:https://example.test/a',
        resolvedAt: null,
        verdict: {
          id: `v${i}`,
          subject: { kind: 'page', ref: 'https://example.test/a' },
          category: 'injection',
          severity: 'major',
          confidence: 'high',
          evidence: [{ kind: 'hidden-text', stage: 'rules', locator: 'div', snippet: 'x', detail: {} }],
          action: 'sanitize',
          sources: [{ name: 'stage:rules', version: '1', updatedAt: '2026-08-05T00:00:00Z' }],
          createdAt: '2026-08-05T00:00:00.000Z',
        },
      })
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, count)
}

test('the first run counts what it found and says which checks could not run', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/first-run.html`)
  await seedFindings(page, 5)
  await page.reload()

  await expect(page.locator('[data-role=result]')).toContainText('5 things need your attention')
  // Honest about capability, not silent about it.
  await expect(page.locator('[data-role=check]')).not.toHaveCount(0)
})

test('the way on leads to at most three things', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/first-run.html`)
  await seedFindings(page, 5)
  await page.reload()

  // Armed before the click: the tab can open before a listener added after it.
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('[data-role=continue]').click(),
  ])
  await expect(opened.locator('[data-role=queue-section] [data-role=item]')).toHaveCount(3)
  await expect(opened.locator('[data-role=queue-section] [data-role=show-all]')).toContainText('2 more')
})
