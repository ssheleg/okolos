import { SURFACE_MOUNT_MS } from './budgets.js'
import { expect, test } from './fixtures.js'

/**
 * SCN-020, SCN-021, SCN-022 — the daily-use surfaces.
 *
 * These run against the real extension pages on a real profile, seeded through
 * the same IndexedDB the product writes to. What is asserted is mostly what the
 * popup refuses to say: no clean verdict it could not compute, no fourth queue
 * item, no silently shortened journal.
 */

/**
 * Establishes a known state — it does not add to an unknown one.
 *
 * The clear is the point. Without it these tests asserted exact counts over a
 * store the extension also writes to, so they held only while the extension
 * happened to stay silent. Once the fixture stopped letting the suite reach the
 * production feed, the honest "the blocking feed could not be fetched" entry
 * appeared and two of them broke — having been green for the wrong reason.
 *
 * **And a clear is a moment, while the writer is mid-sentence.** That was not
 * enough: SCN-021 asks for the journal's *empty* state, and on CI (`20669fa`) the
 * worker's feed refusal landed **after** the clear, so the panel showed an entry and
 * `[data-role=empty]` was never rendered. Raising a timeout makes that worse — the
 * longer the wait, the surer the write.
 *
 * **Writing `feed:lastAttemptedAt` as "now" does not fix it, and the first attempt at
 * this did exactly that.** The worker boots on the first `chrome-extension://`
 * navigation, which is *before* the seed runs, so its one pull is already in flight
 * by then. The timestamp only prevents a *second* pull — worth having, and not the
 * race.
 *
 * So the seed waits for the writer to finish instead of hoping to outrun it, and each
 * wait means one definite thing:
 *
 *   1. `feed:lastAttemptedAt` appears — the worker has *decided* to pull. It writes
 *      that marker **before** the request (B-54: a throw would otherwise leave no
 *      mark), so from here exactly one outcome entry is coming.
 *   2. the journal gains an entry — that outcome has landed.
 *   3. only then: clear, seed, and set the marker to now so a later boot skips.
 *
 * Step 1 is what makes step 2 a bounded wait rather than a guess about a writer that
 * may never write.
 */
async function seed(
  page: import('@playwright/test').Page,
  data: { findings?: unknown[]; journal?: unknown[]; lastCheck?: string },
): Promise<void> {
  await settle(page)
  await page.evaluate(async (payload) => {
    const open = indexedDB.open('okolos')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const tx = db.transaction(['findings', 'journal', 'settings'], 'readwrite')
    tx.objectStore('findings').clear()
    tx.objectStore('journal').clear()
    for (const finding of payload.findings ?? []) tx.objectStore('findings').put(finding)
    for (const entry of payload.journal ?? []) tx.objectStore('journal').put(entry)
    if (payload.lastCheck) {
      tx.objectStore('settings').put({ key: 'popup:lastCheck', value: payload.lastCheck })
    }
    // Inside the same transaction as the clear, so no wake-up can slip between the
    // two and write the entry this is here to prevent.
    tx.objectStore('settings').put({
      key: 'feed:lastAttemptedAt',
      value: new Date().toISOString(),
    })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, data)
}

/** Reads one store from the profile the extension actually writes to. */
async function readStore(
  page: import('@playwright/test').Page,
  store: 'journal' | 'settings',
): Promise<unknown[]> {
  return page.evaluate(async (name) => {
    const open = indexedDB.open('okolos')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const request = db.transaction(name).objectStore(name).getAll()
    const all = await new Promise<unknown[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as unknown[])
      request.onerror = () => reject(request.error)
    })
    db.close()
    return all
  }, store)
}

/**
 * Waits until the worker's one feed attempt has finished writing.
 *
 * Both waits are bounded and neither is allowed to pass by absence. If the marker
 * never appears, the extension stopped pulling on boot and these tests no longer
 * mean what they say — that is a failure with a sentence, not a quiet continue.
 */
async function settle(page: import('@playwright/test').Page): Promise<void> {
  await expect
    .poll(
      async () =>
        (await readStore(page, 'settings')).some(
          (row) => (row as { key?: string }).key === 'feed:lastAttemptedAt',
        ),
      {
        timeout: SURFACE_MOUNT_MS,
        message:
          'the worker never recorded a feed attempt: it no longer pulls on boot, so seeding cannot know what it is waiting for',
      },
    )
    .toBe(true)

  await expect
    .poll(async () => (await readStore(page, 'journal')).length, {
      timeout: SURFACE_MOUNT_MS,
      message:
        'the feed attempt was recorded but produced no journal entry: either the fixture stopped refusing outbound requests or the refusal stopped being journalled',
    })
    .toBeGreaterThan(0)
}

function finding(id: string, severity = 'major'): Record<string, unknown> {
  return {
    id,
    createdAt: '2026-08-05T00:00:00.000Z',
    subject: 'page:https://example.test/article',
    resolvedAt: null,
    verdict: {
      id: `v-${id}`,
      subject: { kind: 'page', ref: 'https://example.test/article' },
      category: 'injection',
      severity,
      confidence: 'high',
      evidence: [
        {
          kind: 'hidden-text',
          stage: 'rules',
          locator: 'div',
          snippet: 'Ignore all previous instructions',
          detail: {},
        },
      ],
      action: 'sanitize',
      sources: [{ name: 'stage:rules', version: '1', updatedAt: '2026-08-05T00:00:00Z' }],
      createdAt: '2026-08-05T00:00:00.000Z',
    },
  }
}

test('SCN-020 — a fresh profile says nothing needs you, and says which page it checked', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)

  await expect(page.locator('[data-role=queue-empty]')).toHaveText('Nothing needs you right now.')

  // Opened as a tab rather than from the toolbar, the popup has no activeTab
  // grant and cannot see which page is in front. What is asserted here is the
  // product-level rule — it refuses to say "clean" about a page it cannot see —
  // not which of the two guards produced it; the unit tests separate those.
  await expect(page.locator('[data-role=popup]')).toHaveAttribute('data-verdict', 'unknown')
})

test('SCN-022 — three items at a time, and the rest counted rather than hidden', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await seed(page, { findings: Array.from({ length: 7 }, (_, i) => finding(`f${i}`)) })
  await page.reload()

  await expect(page.locator('[data-role=item]')).toHaveCount(3)
  await expect(page.locator('[data-role=show-all]')).toContainText('4 more')

  await page.locator('[data-role=show-all]').click()
  await expect(page.locator('[data-role=item]')).toHaveCount(7)
  await expect(page.locator('[data-role=show-all]')).toHaveCount(0)
})

test('SCN-022 — the worst thing is at the top', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await seed(page, {
    findings: [finding('minor', 'minor'), finding('critical', 'critical'), finding('major')],
  })
  await page.reload()

  const first = page.locator('[data-role=item]').first()
  await expect(first).toHaveAttribute('data-severity', 'critical')
})

test('SCN-021 — the journal shows what changed since the last check, not everything', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html#journal`)
  await seed(page, {
    lastCheck: '2026-08-04T00:00:00.000Z',
    journal: [
      {
        id: 'j-old',
        createdAt: '2026-08-01T00:00:00.000Z',
        kind: 'action',
        detail: { explain: 'An old decision nobody needs to see again.' },
      },
      {
        id: 'j-new',
        createdAt: '2026-08-05T09:00:00.000Z',
        kind: 'action',
        detail: { explain: 'Blocked: you stopped "Submit a form on this page".', reason: 'user-blocked' },
      },
    ],
  })
  await page.reload()

  const journal = page.locator('[data-role=journal]')
  await expect(journal.locator('[data-role=entry]')).toHaveCount(1)
  await expect(journal.locator('[data-role=entry]')).toContainText('you stopped')
  await expect(journal.locator('[data-role=entry]')).toContainText('you did this')

  // Full history is available, but it is a request rather than the default.
  await journal.locator('[data-role=history]').click()
  await expect(journal.locator('[data-role=entry]')).toHaveCount(2)
})

test('SCN-021 — an empty diff names the moment it is empty since', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html#journal`)
  await seed(page, { lastCheck: '2026-08-04T00:00:00.000Z' })
  await page.reload()

  // Scoped to the journal: the self-audit panel above it has an empty state too.
  const journal = page.locator('[data-role=journal]')
  await expect(journal.locator('[data-role=empty]')).toContainText('2026-08-04')
  await expect(journal.locator('[data-role=retention]')).toContainText('90 days')
})

test('the empty journal is empty because the writer had finished, not by luck', async ({
  context,
  extensionId,
}) => {
  /**
   * The plant for `settle()`, kept rather than thrown away.
   *
   * Without the wait, `seed()` clears a journal the worker is still writing to, and
   * whether SCN-021 sees an empty panel depends on which lands first. It lands the
   * right way on this machine and the wrong way on CI — so a fix here is a claim with
   * no check behind it unless the losing order can be produced deliberately.
   *
   * This produces it: put an entry in the store after the seed, which is what a late
   * worker write amounts to. With an entry there the empty state must be gone — the
   * state CI saw, reached on purpose.
   *
   * **What this does not demonstrate, said plainly.** Removing `settle()` does not
   * redden anything on this machine: the clear wins the race here every time, which is
   * why the defect was CI-only in the first place. So two things are shown and a third
   * is inferred. Shown: a late entry is *sufficient* to produce CI's exact failure
   * (this test), and the write `settle()` waits for is *real* — all eight tests in this
   * file call it, and each of its two polls fails with its own sentence if the
   * extension stops pulling on boot or stops journalling the refusal. Inferred: that
   * waiting for it removes the race. A CI run is the only place that last step can be
   * observed, and it is worth writing down that it has not been.
   */
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html#journal`)
  await seed(page, { lastCheck: '2026-08-04T00:00:00.000Z' })
  await page.reload()

  // The empty state is what the seeded profile shows.
  const journal = page.locator('[data-role=journal]')
  await expect(journal.locator('[data-role=empty]')).toContainText('2026-08-04')

  // Now one more entry, exactly as a late worker write would leave it.
  await page.evaluate(async () => {
    const open = indexedDB.open('okolos')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const tx = db.transaction('journal', 'readwrite')
    tx.objectStore('journal').put({
      id: 'late:feed',
      createdAt: new Date().toISOString(),
      kind: 'action',
      detail: { reason: 'feed-refused', explain: 'a write that arrived after the clear' },
    })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })
  await page.reload()

  // The empty state cannot survive an entry, which is why the clear must come last.
  await expect(journal.locator('[data-role=entry]')).not.toHaveCount(0)
  await expect(journal.locator('[data-role=empty]')).toHaveCount(0)
})

test('SCN-022 — an item can be finished, and the next one takes its place', async ({
  context,
  extensionId,
}) => {
  // The queue's whole promise is a list you can finish. Until these controls
  // existed the only action opened the page, so it could be read and never
  // cleared.
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await seed(page, { findings: Array.from({ length: 4 }, (_, i) => finding(`f${i}`)) })
  await page.reload()

  await expect(page.locator('[data-role=item]')).toHaveCount(3)
  await expect(page.locator('[data-role=show-all]')).toContainText('1 more')

  await page.locator('[data-role=item] [data-role=resolve]').first().click()

  // Three still shown, because the fourth was promoted — and nothing is held
  // back any more.
  await expect(page.locator('[data-role=item]')).toHaveCount(3)
  await expect(page.locator('[data-role=show-all]')).toHaveCount(0)
})

test('SCN-022 — "not now" moves an item without pretending it is gone', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await seed(page, {
    findings: [finding('critical', 'critical'), finding('minor', 'minor')],
  })
  await page.reload()

  await expect(page.locator('[data-role=item]').first()).toHaveAttribute('data-severity', 'critical')
  await page.locator('[data-role=item] [data-role=defer]').first().click()

  // Still two items: deferring is not dismissing. The worse one is simply last.
  await expect(page.locator('[data-role=item]')).toHaveCount(2)
  await expect(page.locator('[data-role=item]').first()).toHaveAttribute('data-severity', 'minor')
})
