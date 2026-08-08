import { describe, expect, it } from 'vitest'

import { dueForSweep, pruneExpired, SWEEP_INTERVAL_MS } from './retention.js'
import { RETENTION_DAYS } from './schema.js'

/**
 * Retention's own tests.
 *
 * The sweep was covered through the background's alarm handler, where what is
 * asserted is that the handler runs — not what it keeps and what it drops, and
 * not when it is owed. The ninety days on the journal screen is a promise to
 * the user; this is the file that has to make it true.
 */

/** The smallest thing shaped like the database the sweep walks. */
interface Row {
  readonly id: string
  readonly createdAt?: string
  readonly resolvedAt?: string | null
}

function fakeDb(seed: Record<string, Row[]>) {
  const stores: Record<string, Row[]> = {
    journal: [],
    outbound_log: [],
    findings: [],
    ...seed,
  }
  const db = {
    getAll: async (name: string) => [...(stores[name] ?? [])],
    delete: async (name: string, id: string) => {
      stores[name] = (stores[name] ?? []).filter((row) => row.id !== id)
    },
  }
  /** Reading the result is what the assertions do, so it is typed rather than cast. */
  const ids = (name: string): string[] => (stores[name] ?? []).map((row) => row.id)
  return { db: db as never, ids }
}

describe('what the sweep drops and what it keeps', () => {
  const NOW = Date.parse('2026-08-08T00:00:00.000Z')
  const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString()

  it('drops journal entries past the window and keeps the rest', async () => {
    const { db, ids } = fakeDb({
      journal: [
        { id: 'old', createdAt: daysAgo(RETENTION_DAYS.journal + 1) },
        { id: 'fresh', createdAt: daysAgo(1) },
      ],
    })
    await pruneExpired(db, NOW)
    expect(ids('journal')).toEqual(['fresh'])
  })

  it('drops audit entries on the same window', async () => {
    const { db, ids } = fakeDb({
      outbound_log: [
        { id: 'old', createdAt: daysAgo(RETENTION_DAYS.outbound_log + 1) },
        { id: 'fresh', createdAt: daysAgo(2) },
      ],
    })
    await pruneExpired(db, NOW)
    expect(ids('outbound_log')).toEqual(['fresh'])
  })

  it('never drops an unresolved finding, however old', async () => {
    // An unresolved finding is work the user still owes themselves. Ageing it
    // out would quietly discard the only record that anything was wrong.
    const { db, ids } = fakeDb({
      findings: [{ id: 'ancient', createdAt: daysAgo(3650), resolvedAt: null }],
    })
    await pruneExpired(db, NOW)
    expect(ids('findings')).toEqual(['ancient'])
  })
})


describe('deciding whether a sweep is owed', () => {
  const NOW = Date.parse('2026-08-08T12:00:00.000Z')
  const ago = (ms: number) => new Date(NOW - ms).toISOString()

  it('is owed when nothing was ever swept', () => {
    expect(dueForSweep(null, NOW)).toBe(true)
    expect(dueForSweep(undefined, NOW)).toBe(true)
  })

  it('is not owed again immediately', () => {
    expect(dueForSweep(ago(60_000), NOW)).toBe(false)
  })

  it('is owed once the interval has passed', () => {
    expect(dueForSweep(ago(SWEEP_INTERVAL_MS + 1), NOW)).toBe(true)
  })

  it('treats an unreadable timestamp as owed, not as done', () => {
    // Skipping keeps data past the window the user was promised; sweeping
    // twice costs a few deletes.
    expect(dueForSweep('not a date', NOW)).toBe(true)
  })

  it('is owed when the stored time is in the future', () => {
    // A corrected system clock or a restored profile would otherwise postpone
    // the sweep for as long as the skew lasts.
    expect(dueForSweep(ago(-SWEEP_INTERVAL_MS), NOW)).toBe(true)
  })
})
