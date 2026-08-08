import { describe, expect, it } from 'vitest'

import { exportAll, wipeAll } from './export.js'
import { STORES } from './schema.js'

/**
 * Export and wipe, tested where they live.
 *
 * These are the two operations the privacy promise ends in: the user can take
 * everything out, and the user can make everything go. A wipe that half-worked
 * and said it succeeded is the failure this file exists to prevent, and it was
 * covered only through the options page — where what is asserted is that a
 * button was clicked.
 */

function fakeDb(overrides: { failOn?: readonly string[] } = {}) {
  const cleared: string[] = []
  return {
    cleared,
    db: {
      getAll: async (store: string) => [{ id: `${store}-1` }],
      clear: async (store: string) => {
        if (overrides.failOn?.includes(store)) throw new Error('nope')
        cleared.push(store)
      },
    } as never,
  }
}

describe('taking everything out', () => {
  it('includes every store the schema declares, not a chosen few', () => {
    // A store added later and forgotten here is data the user cannot export
    // and does not know they have.
    const { db } = fakeDb()
    return exportAll(db).then((json) => {
      const dump = JSON.parse(json) as Record<string, unknown[]>
      expect(Object.keys(dump).sort()).toEqual([...STORES].sort())
    })
  })

  it('produces something a person can read', async () => {
    const { db } = fakeDb()
    expect(await exportAll(db)).toContain('\n')
  })
})

describe('making everything go', () => {
  it('clears every store', async () => {
    const { db, cleared } = fakeDb()
    const result = await wipeAll(db)
    expect(result.ok).toBe(true)
    expect(cleared.sort()).toEqual([...STORES].sort())
  })

  it('does not report success when a store refused', async () => {
    const failing = STORES[1] as string
    const { db } = fakeDb({ failOn: [failing] })
    const result = await wipeAll(db)
    expect(result.ok).toBe(false)
    expect(result.failed).toContain(failing)
  })

  it('keeps going after one store fails, rather than stopping there', async () => {
    // Stopping would leave the rest untouched while reporting one failure, and
    // the user would read "mostly done" as done.
    const failing = STORES[0] as string
    const { db, cleared } = fakeDb({ failOn: [failing] })
    await wipeAll(db)
    expect(cleared).toHaveLength(STORES.length - 1)
  })
})
