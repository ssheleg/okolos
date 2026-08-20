import { describe, expect, it } from 'vitest'

import {
  holdVerdict,
  PENDING_TTL_MS,
  pendingKey,
  releaseVerdict,
  takeVerdict,
  type PendingStore,
  type PendingVerdict,
} from './pending-password.js'

function store(): PendingStore & { readonly map: Map<string, unknown> } {
  const map = new Map<string, unknown>()
  return {
    map,
    get: async <T>(key: string) => map.get(key) as T | undefined,
    set: async (key, value) => {
      map.set(key, value)
    },
    remove: async (key) => {
      map.delete(key)
    },
  }
}

const NOW = Date.parse('2026-08-20T12:00:00.000Z')

function verdict(over: Partial<PendingVerdict> = {}): PendingVerdict {
  return {
    host: 'shop.test',
    verdict: {
      compromised: true,
      count: null,
      offline: true,
      explain: { code: 'in-common-list' },
      reusedOn: [],
      reuseUnknown: false,
    },
    at: new Date(NOW).toISOString(),
    ...over,
  }
}

describe('a verdict held until somebody shows it', () => {
  it('comes back to the tab that is holding it', async () => {
    const s = store()
    await holdVerdict(s, 7, verdict())
    expect(await takeVerdict(s, 7, NOW)).toEqual(verdict())
  })

  it('is held per tab, so one tab cannot answer for another', async () => {
    const s = store()
    await holdVerdict(s, 7, verdict({ host: 'a.test' }))
    await holdVerdict(s, 8, verdict({ host: 'b.test' }))
    expect((await takeVerdict(s, 7, NOW))?.host).toBe('a.test')
    expect((await takeVerdict(s, 8, NOW))?.host).toBe('b.test')
  })

  it('keeps the newer of two verdicts in one tab, rather than a queue', async () => {
    const s = store()
    await holdVerdict(s, 7, verdict({ host: 'first.test' }))
    await holdVerdict(s, 7, verdict({ host: 'second.test' }))
    expect((await takeVerdict(s, 7, NOW))?.host).toBe('second.test')
    expect(s.map.size).toBe(1)
  })

  it('does not answer twice: a confirmed verdict is forgotten', async () => {
    const s = store()
    await holdVerdict(s, 7, verdict())
    await releaseVerdict(s, 7)
    expect(await takeVerdict(s, 7, NOW)).toBeNull()
  })

  /**
   * The ceiling, and the reason reading is not enough.
   *
   * `storage.local` survives a browser restart, so without a ceiling a verdict would
   * wait for days and then appear on a page the person reached long after the login it
   * is about.
   */
  it('refuses a verdict older than the ceiling', async () => {
    const s = store()
    await holdVerdict(s, 7, verdict())
    expect(await takeVerdict(s, 7, NOW + PENDING_TTL_MS + 1)).toBeNull()
  })

  it('still answers at the ceiling itself', async () => {
    const s = store()
    await holdVerdict(s, 7, verdict())
    expect(await takeVerdict(s, 7, NOW + PENDING_TTL_MS)).not.toBeNull()
  })

  /**
   * Expiry answers "show this?"; deletion answers "keep this?". Doing only the first
   * grows a tail of records read and rejected on every page load of every tab, forever.
   */
  it('removes what it refuses, rather than reading it again on every page load', async () => {
    const s = store()
    await holdVerdict(s, 7, verdict())
    await takeVerdict(s, 7, NOW + PENDING_TTL_MS + 1)
    expect(s.map.has(pendingKey(7))).toBe(false)
  })

  it('treats a timestamp it cannot read as expired, and drops it', async () => {
    const s = store()
    await holdVerdict(s, 7, verdict({ at: 'the other day' }))
    expect(await takeVerdict(s, 7, NOW)).toBeNull()
    expect(s.map.has(pendingKey(7))).toBe(false)
  })

  it('answers null for a tab holding nothing', async () => {
    expect(await takeVerdict(store(), 7, NOW)).toBeNull()
  })
})
