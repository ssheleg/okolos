import { expect, test } from './fixtures.js'

/**
 * What the built pages actually put in front of a person.
 *
 * Two classes of defect are invisible to every other check in this repository, because
 * both are *absences* rather than shapes:
 *
 *  - a renderer that hands a stored instant straight to the DOM, so a person reads
 *    `2026-08-20T23:51:17.931Z` where every other screen says `2026-08-20 23:51:17 UTC`;
 *  - a renderer that prints a field the store never wrote, so a person reads
 *    `источник: undefined` on the screen that carries the product's central claim.
 *
 * Both shipped. Both were found on 2026-08-21 by rendering the areas and looking at them,
 * after four store screenshots had been looked at twice and eight areas never once. A
 * textual gate cannot see either: `tools/instants.test.ts` was written for the first one
 * and provably missed it, because the value is passed as an argument to a helper rather
 * than assigned to `textContent`.
 *
 * So this file seeds the stores — including one row written the way an older build or a
 * half-finished migration leaves it — walks every area, and reads the text.
 */

/** A raw stored instant. The rendered form has a space and no `T`. */
const RAW_INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

/** What a template prints when it is handed nothing. */
const NOT_A_VALUE = ['undefined', 'null', 'NaN', '[object Object]']

const AREAS = [
  { hash: '', role: 'overview' },
  { hash: '#recovery=pasted-command', role: 'recovery' },
  { hash: '#queue', role: 'queue-section' },
  { hash: '#journal', role: 'journal' },
  { hash: '#leaks', role: 'leaks' },
  { hash: '#extensions', role: 'extensions' },
  { hash: '#trusted', role: 'trusted' },
  { hash: '#audit', role: 'self-audit' },
  { hash: '#data', role: 'data-controls' },
] as const

/**
 * Rows in the shape the stores hold them, plus one the type forbids and IndexedDB
 * accepts. The incomplete row is the point: a screen that only ever sees rows its own
 * build wrote is a screen nobody has tested against its own history.
 */
async function seed(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    const open = indexedDB.open('okolos')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString()
    const names = [...db.objectStoreNames]
    const tx = db.transaction(names, 'readwrite')
    const put = (store: string, rows: unknown[]) => {
      // Written as a positive condition, not a guard-and-return: a bare early return in a
      // spec file is what `tools/test-quality.test.ts` forbids, and it is right to be
      // blunt about it — the shape is indistinguishable from a test that gives up.
      if (names.includes(store)) {
        for (const row of rows) tx.objectStore(store).put(row as never)
      }
    }

    put('findings', [
      {
        id: 'f1',
        createdAt: iso(4),
        subject: 'page:https://news-agregator.test/',
        resolvedAt: null,
        verdict: {
          id: 'v-f1',
          subject: { kind: 'page', ref: 'https://news-agregator.test/' },
          category: 'injection',
          severity: 'critical',
          confidence: 'high',
          evidence: [
            { kind: 'hidden-text', stage: 'rules', locator: 'div', snippet: 'скрытая команда', detail: {} },
          ],
          action: 'sanitize',
          sources: [{ name: 'stage:rules', version: '1', updatedAt: iso(60) }],
          createdAt: iso(4),
        },
      },
    ])
    put('journal', [{ id: 'j1', createdAt: iso(6), kind: 'verdict', detail: {} }])
    put('outbound_log', [
      {
        id: 'o1',
        createdAt: iso(9),
        destination: 'api.pwnedpasswords.com',
        purpose: 'password-range',
        payloadShape: 'hash-prefix:5BAA6',
        triggeredBy: 'user:password-check',
        outcome: 'sent',
      },
      // Written by a build that did not have these fields yet.
      { id: 'o2', createdAt: iso(11) },
    ])
    put('snapshots', [
      {
        extensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        name: 'Переводчик страниц',
        version: '3.2.1',
        permissions: ['tabs'],
        seenAt: iso(12),
      },
    ])
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })
}

for (const { hash, role } of AREAS) {
  test(`the ${role} area shows no machine value where a person is reading`, async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await seed(page)
    await page.goto(`chrome-extension://${extensionId}/options.html${hash}`)
    // Waiting on the area, not on a clock: reading a page that has not painted finds
    // nothing wrong with nothing.
    await expect(page.locator(`[data-role=${role}]`)).toHaveCount(1)

    const shown = (await page.locator('body').innerText()).trim()
    expect(shown, `${role} rendered nothing`).not.toBe('')
    expect(shown, `${role} shows a raw stored instant`).not.toMatch(RAW_INSTANT)
    for (const literal of NOT_A_VALUE) {
      expect(shown, `${role} prints "${literal}"`).not.toContain(literal)
    }
  })
}
