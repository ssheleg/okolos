import { expect, test } from './fixtures.js'

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
  await expect(entries).toHaveCount(1, { timeout: 15_000 })
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
  }).toPass({ timeout: 15_000 })
})
