import { expect, test } from './fixtures.js'
import { RECORD_VISIBLE_MS } from './budgets.js'

/**
 * SCN-019 — the user asks what left the device and gets an answer they can
 * check.
 *
 * These two tests used to assert that a fresh install had sent nothing, and
 * that was true for a reason nobody had noticed: the extension fetched no
 * feed, so it made no requests at all. The blocking list was empty on every
 * install and the panel's honesty rested on the product doing nothing.
 *
 * A fresh install now pulls the blocking feed, so there is one entry, and the
 * panel showing it is the self-audit working rather than failing. What is
 * asserted here is what the entry has to say for itself.
 */

test('a fresh install shows the one request it made, and what it was for', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html#audit`)

  await expect(page.getByText('What left this device')).toBeVisible()

  const entries = page.locator('[data-role=entries] [data-role=entry]')
  await expect(entries).toHaveCount(1, { timeout: RECORD_VISIBLE_MS })
  // The words a person reads, not the key the code uses: the panel exists to
  // be understood, and asserting the internal name would let the wording rot.
  await expect(entries.first()).toContainText('list of known-bad sites')
  await expect(entries.first()).toContainText('alarm:feeds')
  // A feed is a public list. The entry must show that nothing personal went
  // with the request, which is the whole point of writing it down.
  await expect(entries.first()).toContainText('none')
})

test('the panel never shows an empty list in place of a failure', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html#audit`)

  // An entries table with no rows reads as "nothing was sent", which is a
  // claim the product may only make when it knows it. Either there are rows,
  // or there is the sentence — never a table standing empty.
  const table = page.locator('[data-role=entries]')
  const rows = page.locator('[data-role=entries] [data-role=entry]')
  const sentence = page.getByText('Nothing has been sent from this device.')

  await expect(async () => {
    const hasRows = (await rows.count()) > 0
    const hasTable = (await table.count()) > 0
    const hasSentence = (await sentence.count()) > 0
    expect(hasRows || hasSentence, 'neither rows nor the sentence — an empty claim').toBe(true)
    if (hasTable) expect(hasRows, 'a table with no rows is an empty claim').toBe(true)
  }).toPass({ timeout: RECORD_VISIBLE_MS })
})

test('a row opens, and says what that request sends and what it does not', async ({
  context,
  extensionId,
}) => {
  /**
   * SCN-019 step 2 — "user opens a row" — had no coverage and, until 2026-08-21, nothing to
   * cover: rows were flat and unopenable while SCR-10's record promised per-row detail
   * (B-101). What is behind the row is what the log holds: the exact bytes are deliberately
   * not stored, so the detail names what left for that purpose and what was held back.
   */
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html#audit`)

  const row = page.locator('[data-role=entries] [data-role=entry]').first()
  await expect(row).toBeVisible({ timeout: RECORD_VISIBLE_MS })

  const kept = row.locator('[data-role=entry-kept]')
  // Present in the DOM either way — `<details>` hides its content rather than dropping it —
  // so the assertion is about what a person can *see*.
  await expect(kept).toBeHidden()

  await row.locator('summary').click()
  await expect(kept).toBeVisible()
  // The feed download is the one request a fresh profile has made.
  await expect(kept).toContainText('signed list')
  await expect(row.locator('[data-role=entry-outcome]')).toContainText('sent')
})

test('the period is a control, and widening it keeps the panel honest', async ({
  context,
  extensionId,
}) => {
  // Retention is ninety days and the default view is seven; before this the other
  // eighty-three were reachable only by exporting the file.
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html#audit`)

  // The control belongs to the `ready` state, and a profile with nothing sent yet is
  // `empty` — the feed download lands within a second of the worker booting, but "within a
  // second" is a race, and this test passed alone and failed in the full run because of it.
  await expect(page.locator('[data-role=entries] [data-role=entry]').first()).toBeVisible({
    timeout: RECORD_VISIBLE_MS,
  })

  const week = page.locator('[data-role=window-week]')
  const all = page.locator('[data-role=window-all]')
  await expect(week).toHaveAttribute('aria-pressed', 'true', { timeout: RECORD_VISIBLE_MS })
  await expect(all).toHaveAttribute('aria-pressed', 'false')

  await all.click()
  await expect(all).toHaveAttribute('aria-pressed', 'true')
  await expect(week).toHaveAttribute('aria-pressed', 'false')
  // The summary follows the control rather than keeping the sentence it opened with.
  await expect(page.locator('[data-role=summary]')).toContainText('Everything kept')
})
