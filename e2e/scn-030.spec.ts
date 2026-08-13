import type { Page } from '@playwright/test'

import { expect, test } from './fixtures.js'

/**
 * SCN-030 and the two states beside it, in a browser.
 *
 * All three were shipped with unit coverage and marked `never` in
 * `docs/superpowers/verification.md`, because none of them occurs on a clean
 * profile: the attention band needs more findings than it will show, the unread
 * row needs a read that fails, and the pending mark needs an action in flight.
 * A renderer test hands the renderer each of those states directly, which
 * proves the drawing and not the getting there.
 */

async function seedFindings(page: Page, count: number): Promise<void> {
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
          severity: i === 0 ? 'critical' : 'major',
          confidence: 'high',
          evidence: [
            { kind: 'hidden-text', stage: 'rules', locator: 'div', snippet: 'x', detail: {} },
          ],
          action: 'sanitize',
          sources: [{ name: 'stage:rules', version: '1', updatedAt: '2026-08-05T00:00:00Z' }],
          createdAt: '2026-08-05T00:00:00.000Z',
        },
      })
    }
    await new Promise((resolve) => {
      tx.oncomplete = resolve
    })
    db.close()
  }, count)
}

/** Stores a recovery entry whose JSON cannot be parsed. */
async function seedCorruptRecovery(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const open = indexedDB.open('okolos')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const tx = db.transaction(['settings'], 'readwrite')
    tx.objectStore('settings').put({ key: 'recovery:pasted-command', value: '{not json' })
    await new Promise((resolve) => {
      tx.oncomplete = resolve
    })
    db.close()
  })
}

test('SCN-027 — the band shows three and counts the rest', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await seedFindings(page, 5)
  await page.reload()

  await expect(page.locator('[data-role=attention-item]')).toHaveCount(3)
  // The cap is the queue's cap, on purpose. A band that lists everything is
  // the alert wall this product exists because of, under a new name.
  await expect(page.locator('[data-role=attention-more]')).toContainText('2')
  await expect(page.locator('[data-role=attention-empty]')).toHaveCount(0)
})

test('SCN-027 — the worst thing is the first thing', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await seedFindings(page, 5)
  await page.reload()

  const first = page.locator('[data-role=attention-item]').first()
  await expect(first).toHaveAttribute('data-severity', 'critical')
  // Severity reaches the reader as a word, not only as a mark and a colour.
  await expect(first.locator('[data-role=attention-severity]')).not.toHaveText('')
})

test('SCN-030 — a state that could not be read never renders as "nothing"', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await seedCorruptRecovery(page)
  await page.reload()

  const state = page.locator('[data-area=recovery] [data-role=area-state]')
  await expect(state).toHaveAttribute('data-unread', 'true')

  // And it does not borrow the words a genuinely quiet area uses. This is the
  // whole scenario: eight cheap reads, any of which can fail, all of them able
  // to render into one reassuring sentence.
  const quiet = await page.locator('[data-area=trusted] [data-role=area-state]').textContent()
  await expect(state).not.toHaveText(quiet ?? '')
})

test('SCN-030 — one corrupt entry does not blank the whole band', async ({
  context,
  extensionId,
}) => {
  // It used to. `openIncidents` threw from inside the attention band's own try,
  // so a single unparseable settings row reported all eight areas as unreadable.
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await seedFindings(page, 4)
  await seedCorruptRecovery(page)
  await page.reload()

  await expect(page.locator('[data-role=attention-item]')).toHaveCount(3)
  await expect(page.locator('[data-role=attention-error]')).toHaveCount(0)
  // The one area that could not answer still says so.
  await expect(page.locator('[data-unread=true]')).toHaveCount(1)
})

test('SCN-029 — the pressed control is marked before its result arrives', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html#queue`)
  await seedFindings(page, 3)
  await page.reload()

  const done = page.locator('[data-role=queue-section] [data-role=resolve]').first()
  await expect(done).toHaveCount(1)

  // Read from inside the click, because the state is over as soon as the write
  // returns. `evaluate` runs the press and reads the attribute in the same task,
  // which is the only place the mark is observable from outside.
  const marked = await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('[data-role=resolve]')
    if (!button) return null
    button.focus()
    button.click()
    return {
      pending: button.getAttribute('data-pending'),
      busy: button.getAttribute('aria-busy'),
      disabled: button.disabled,
    }
  })

  expect(marked).toEqual({ pending: 'true', busy: 'true', disabled: true })
  // And the action really did go through, rather than being marked and dropped.
  await expect(page.locator('[data-role=queue-section] [data-role=item]')).toHaveCount(2)
})
