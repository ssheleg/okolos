import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDb, openDb } from '@okolos/storage'

import { hasUnresolvedFinding, recordPageRequest } from './page-requests.js'

/**
 * The decision the page must not own.
 *
 * The watcher's off switch used to be a boolean in the MAIN world, flipped by
 * `window.postMessage` — and `event.source === win` is true of the page's own
 * post, so one line of page script silenced the one mechanism whose entire value
 * is that a record exists. ADR-0009 says a forged line costs noise rather than
 * silence; the code sold silence.
 *
 * It is answered here instead, from the extension's own database, against the
 * origin the **sender** reports. A page can put any host in a message it forges;
 * it cannot forge where the message came from.
 */

const NOW = '2026-08-20T05:00:00.000Z'
const deps = async () => ({ db: await openDb(), now: () => NOW })

async function seedFinding(
  subject: string,
  resolvedAt: string | null = null,
): Promise<void> {
  const db = await openDb()
  await db.put('findings', {
    id: `f-${subject}-${resolvedAt ?? 'open'}`,
    createdAt: '2026-08-19T00:00:00.000Z',
    subject,
    resolvedAt,
  })
}

const journal = async () => (await openDb()).getAll('journal')

beforeEach(() => {
  indexedDB.deleteDatabase('okolos')
  closeDb()
})

describe('whether this origin still has something unresolved', () => {
  it('says yes for a finding on the same origin, whatever the path', async () => {
    // The watcher reports per page, not per path: a finding on `/a` is a finding
    // on that site, and a request made from `/checkout` is the one that matters.
    await seedFinding('page:https://shop.test/a')
    expect(await hasUnresolvedFinding(await openDb(), 'https://shop.test')).toBe(true)
  })

  it('says no once it has been resolved', async () => {
    await seedFinding('page:https://shop.test/a', '2026-08-20T04:00:00.000Z')
    expect(await hasUnresolvedFinding(await openDb(), 'https://shop.test')).toBe(false)
  })

  it('says no for a different origin, including one that merely starts the same', async () => {
    /**
     * `page:https://shop.test` is a prefix of `page:https://shop.test.evil.test`
     * read as a string, so an attacker registering that name would inherit the
     * real site's findings — and with them the right to have their own requests
     * recorded, or to have the real site's stop being. The origin carries its
     * scheme and host and nothing else, and the stored subject begins with the
     * origin followed by a path, so `/` is what separates them.
     */
    await seedFinding('page:https://shop.test/a')
    expect(await hasUnresolvedFinding(await openDb(), 'https://shop.test.evil.test')).toBe(false)
    expect(await hasUnresolvedFinding(await openDb(), 'https://other.test')).toBe(false)
  })

  it('says no when the sender has no origin at all', async () => {
    // A report that cannot be placed is a report about nothing. Treating it as
    // probably-worth-keeping hands the decision back to whoever sent it.
    await seedFinding('page:https://shop.test/a')
    expect(await hasUnresolvedFinding(await openDb(), undefined)).toBe(false)
  })
})

describe('what gets written, and what does not', () => {
  const REQUEST = { method: 'POST', host: 'bank.test' }

  it('records a request from a page that really has a finding on it', async () => {
    await seedFinding('page:https://shop.test/checkout')
    expect(await recordPageRequest(await deps(), REQUEST, 'https://shop.test')).toBe(true)

    const rows = await journal()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.detail).toMatchObject({
      explainKey: 'logPageRequest',
      explainArgs: ['POST', 'bank.test'],
      reason: 'page-request',
    })
  })

  it('writes nothing for a forged report from a clean page', async () => {
    /**
     * The improvement over what ADR-0009 settled for. A page that arms the
     * watcher itself — which it can, and which the design accepts — used to fill
     * the journal with requests that had no finding behind them. Now it fills
     * nothing.
     */
    expect(await recordPageRequest(await deps(), REQUEST, 'https://clean.test')).toBe(false)
    expect(await journal()).toEqual([])
  })

  it('writes nothing once the finding is resolved, which is what disarming used to do', async () => {
    await seedFinding('page:https://shop.test/a', '2026-08-20T04:00:00.000Z')
    expect(await recordPageRequest(await deps(), REQUEST, 'https://shop.test')).toBe(false)
    expect(await journal()).toEqual([])
  })

  it('believes the sender about the origin and the payload about nothing else', async () => {
    /**
     * The payload's `host` is the request's destination and is written down; the
     * *page's* identity comes from the sender. A forged report claiming to come
     * from a flagged site is dropped, because the origin it actually came from is
     * the one that is checked.
     */
    await seedFinding('page:https://flagged.test/a')
    const forged = { method: 'POST', host: 'flagged.test' }
    expect(await recordPageRequest(await deps(), forged, 'https://clean.test')).toBe(false)
    expect(await journal()).toEqual([])
  })

  it('takes its timestamp from the caller, never from a clock', async () => {
    await seedFinding('page:https://shop.test/a')
    await recordPageRequest(await deps(), REQUEST, 'https://shop.test')
    expect((await journal())[0]?.createdAt).toBe(NOW)
  })
})
