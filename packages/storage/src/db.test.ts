/** @vitest-environment node */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { DB_NAME, STORES, WITHHELD_MARKER } from './schema.js'
import { closeDb, openDb, resetStorage, StorageUnavailable, storedVersion } from './db.js'
import { exportAll, wipeAll } from './export.js'
import { pruneExpired } from './retention.js'

const DAY = 24 * 60 * 60 * 1000

function iso(msAgo: number, now = Date.parse('2026-08-04T12:00:00Z')): string {
  return new Date(now - msAgo).toISOString()
}

afterEach(async () => {
  closeDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
})

describe('schema v1', () => {
  it('creates every store the spec names', async () => {
    const db = await openDb()
    expect([...db.objectStoreNames].sort()).toEqual([...STORES].sort())
  })

  it('opens twice without re-running the migration', async () => {
    const first = await openDb()
    const second = await openDb()
    expect(second).toBe(first)
  })
})

describe('retention', () => {
  it('drops journal entries past their window and keeps fresh ones', async () => {
    const db = await openDb()
    await db.put('journal', { id: 'old', createdAt: iso(120 * DAY), kind: 'verdict' })
    await db.put('journal', { id: 'fresh', createdAt: iso(2 * DAY), kind: 'verdict' })

    await pruneExpired(db, Date.parse('2026-08-04T12:00:00Z'))

    expect(await db.get('journal', 'old')).toBeUndefined()
    expect(await db.get('journal', 'fresh')).toBeDefined()
  })

  it('never drops an unresolved finding, however old', async () => {
    const db = await openDb()
    await db.put('findings', {
      id: 'ancient',
      createdAt: iso(400 * DAY),
      subject: 'page:https://example.test/',
      resolvedAt: null,
    })

    await pruneExpired(db, Date.parse('2026-08-04T12:00:00Z'))

    expect(await db.get('findings', 'ancient')).toBeDefined()
  })

  it('drops a resolved finding once its grace period passes', async () => {
    const db = await openDb()
    await db.put('findings', {
      id: 'handled',
      createdAt: iso(120 * DAY),
      subject: 'page:https://example.test/',
      resolvedAt: iso(60 * DAY),
    })

    await pruneExpired(db, Date.parse('2026-08-04T12:00:00Z'))

    expect(await db.get('findings', 'handled')).toBeUndefined()
  })
})

describe('export and wipe', () => {
  it('exports every store, including the empty ones', async () => {
    const db = await openDb()
    await db.put('settings', { key: 'quietMode', value: false })

    const dump = JSON.parse(await exportAll(db, {
      marker: () => WITHHELD_MARKER,
      note: () => 'nothing withheld here',
    })) as Record<string, unknown[]>

    for (const store of STORES) expect(dump[store]).toBeDefined()
    expect(dump.settings).toEqual([{ key: 'quietMode', value: false }])
  })

  it('leaves every store empty after a wipe', async () => {
    const db = await openDb()
    await db.put('settings', { key: 'quietMode', value: true })
    await db.put('journal', { id: 'j1', createdAt: iso(0), kind: 'verdict' })

    const result = await wipeAll(db)

    expect(result.ok).toBe(true)
    for (const store of STORES) expect(await db.count(store)).toBe(0)
  })

  it('reports failure rather than success when a store cannot be cleared', async () => {
    // A wipe that half-worked and said "done" is the worst outcome available:
    // the user believes the data is gone. Partial failure must surface.
    const db = await openDb()
    const brokenDb = {
      ...db,
      clear: async (store: string) => {
        if (store === 'journal') throw new Error('storage unavailable')
      },
    } as unknown as Awaited<ReturnType<typeof openDb>>

    const result = await wipeAll(brokenDb)

    expect(result.ok).toBe(false)
    expect(result.failed).toContain('journal')
  })
})

/**
 * The shape this build expects, written out where a test can compare it.
 *
 * Deliberately a second copy of `SHAPE` rather than an import of it: a table
 * compared against itself agrees with itself, which is how the wipe confirmation
 * came to name five stores of nine. This one is written from the schema and the
 * queries, and where the two disagree one of them is wrong.
 */
const EXPECTED: Record<string, readonly string[]> = {
  findings: ['by-created', 'by-subject'],
  journal: ['by-created', 'by-kind'],
  outbound_log: ['by-created', 'by-purpose'],
  exceptions: ['by-created'],
  settings: [],
  snapshots: [],
  models: ['by-id'],
  feeds: [],
  reuse: ['by-tag'],
}

/** What the profile actually holds, read back from the built database. */
async function actualShape(): Promise<Record<string, string[]>> {
  const db = await openDb()
  const out: Record<string, string[]> = {}
  for (const name of [...db.objectStoreNames]) {
    const store = db.transaction(name).store as unknown as IDBObjectStore
    out[name] = [...store.indexNames].sort()
  }
  return out
}

/**
 * Builds a profile at an older version, with the stores that version had.
 *
 * Raw `indexedDB` rather than `openDb`, because the point is to produce a
 * database this build did not make. Version 1 is the original six stores;
 * 2 added `models`, 3 added `feeds`, 4 added `reuse`.
 */
async function seedProfileAtVersion(version: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('okolos', version)
    request.onupgradeneeded = () => {
      const db = request.result
      // No "already there?" guard: this builds a profile from nothing at a chosen
      // version, so every store is new. The guard was defensive, and a defensive
      // branch in a fixture is a branch a reader has to reason about for no reason.
      const make = (name: string, keyPath: string | string[], indexes: Array<[string, string]>) => {
        const store = db.createObjectStore(name, { keyPath })
        for (const [index, on] of indexes) store.createIndex(index, on)
      }
      make('findings', 'id', [['by-created', 'createdAt'], ['by-subject', 'subject']])
      make('journal', 'id', [['by-created', 'createdAt'], ['by-kind', 'kind']])
      make('outbound_log', 'id', [['by-created', 'createdAt'], ['by-purpose', 'purpose']])
      make('exceptions', ['scope', 'ref'], [['by-created', 'createdAt']])
      make('settings', 'key', [])
      make('snapshots', 'extensionId', [])
      if (version >= 2) make('models', 'key', [['by-id', 'id']])
      if (version >= 3) make('feeds', 'name', [])
      if (version >= 4) make('reuse', ['tag', 'host'], [['by-tag', 'tag']])
    }
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('findings', 'readwrite')
      tx.objectStore('findings').put({
        id: 'kept',
        createdAt: '2026-08-01T00:00:00.000Z',
        subject: 'page:https://example.test/a',
        resolvedAt: null,
      })
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
    request.onerror = () => reject(request.error)
  })
}

describe('upgrading a profile from every version that has shipped', () => {
  /**
   * The test that stood here opened the database twice at the current version,
   * so `upgrade` never ran the second time and **three migrations were covered by
   * nothing.** It read like an upgrade test and asserted that a fresh install has
   * the stores a fresh install has.
   *
   * These build the older profile with raw `indexedDB` — the point is a database
   * this build did not make — seed a finding into it, and then let `openDb` do
   * whatever it does.
   */
  for (const from of [1, 2, 3]) {
    it(`brings version ${from} up to the current shape without losing data`, async () => {
      await seedProfileAtVersion(from)
      closeDb()

      const shape = await actualShape()
      expect(Object.keys(shape).sort()).toEqual(Object.keys(EXPECTED).sort())
      for (const [store, indexes] of Object.entries(EXPECTED)) {
        expect(shape[store], `${store} after upgrading from ${from}`).toEqual([...indexes].sort())
      }

      // The finding written by the older build is still there. An upgrade that
      // dropped and recreated the stores would erase a user's findings to add a
      // column, and it would pass every assertion above.
      const db = await openDb()
      expect(await db.get('findings', 'kept')).toMatchObject({ id: 'kept' })
      expect(db.version).toBe(4)
    })
  }

  it('heals a profile whose store is missing, instead of aborting the whole upgrade', async () => {
    /**
     * A version ≥1 profile without `findings` fell through to a
     * create-everything branch whose first statement threw `ConstraintError` the
     * moment any other store already existed — aborting the transaction and
     * leaving the product with no database at all, plus an unhandled rejection.
     *
     * Reachable from a half-finished upgrade, and the shape of the answer is the
     * same either way: create what is missing.
     */
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('okolos', 3)
      request.onupgradeneeded = () => {
        const db = request.result
        // Everything except `findings`.
        db.createObjectStore('journal', { keyPath: 'id' })
        db.createObjectStore('settings', { keyPath: 'key' })
      }
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
    closeDb()

    const shape = await actualShape()
    expect(Object.keys(shape).sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  it('refuses a profile at this version whose shape is wrong, and names what is absent', async () => {
    /**
     * The limit found by writing these tests, and the reason the shape is
     * verified after opening rather than trusted from the upgrade.
     *
     * IndexedDB changes a schema only inside a version-change transaction. A
     * profile **already at the current version** never runs `upgrade`, so a store
     * or index a half-finished upgrade left out cannot be added — it simply stays
     * missing. `by-tag` absent would make "where else was this password used" a
     * query that answers nothing, quietly, forever.
     */
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('okolos', 4)
      request.onupgradeneeded = () => {
        const db = request.result
        // Everything but one index, and one store missing entirely.
        db.createObjectStore('findings', { keyPath: 'id' })
        db.createObjectStore('reuse', { keyPath: ['tag', 'host'] })
      }
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
    closeDb()

    const failure = await openDb().catch((cause: unknown) => cause)
    expect(failure).toBeInstanceOf(StorageUnavailable)
    const problem = failure as StorageUnavailable
    expect(problem.problem).toBe('shape-incomplete')
    expect(problem.found).toBe(4)
    // Naming what is absent is the difference between a bug report and a shrug.
    expect(String((problem.cause as Error).message)).toContain('index reuse.by-tag')
    expect(String((problem.cause as Error).message)).toContain('store journal')
  })

  it('accepts a profile it built itself, so the verification is not vacuous', async () => {
    // A check that rejects everything would pass the test above and break the
    // product. This is the other direction.
    const db = await openDb()
    expect(db.version).toBe(4)
    expect(Object.keys(await actualShape()).sort()).toEqual(Object.keys(EXPECTED).sort())
  })
})

describe('a profile written by a later build', () => {
  it('is refused by name, with the version it found', async () => {
    /**
     * `openDB` answers a newer profile with a `VersionError` on every call, and
     * nothing in this repository recognised it: the product stopped, six panels
     * deep, each rendering the browser's own sentence about requested and
     * existing versions. It happens on an enterprise rollback and when Chrome
     * reverts an update.
     *
     * Refusing is the right answer and not a fallback — the newer build may have
     * added a store, an index or a field this one cannot describe, and writing
     * into a schema we do not know is how a downgrade becomes data loss.
     */
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('okolos', 9)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore('findings', { keyPath: 'id' })
      }
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
    closeDb()

    const failure = await openDb().catch((cause: unknown) => cause)
    expect(failure).toBeInstanceOf(StorageUnavailable)
    expect((failure as StorageUnavailable).problem).toBe('from-a-newer-version')
    // The version is what tells the user whether updating will help.
    expect((failure as StorageUnavailable).found).toBe(9)
  })

  it('says which version is there without opening it for writing', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('okolos', 7)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('findings', { keyPath: 'id' })
      }
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
    closeDb()
    expect(await storedVersion()).toBe(7)
  })

  it('has a way out that does not need a connection', async () => {
    // `wipeAll` needs an open database, and the case it would be needed for is
    // exactly the case where there is none. Deleting the store is the recovery.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('okolos', 9)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('findings', { keyPath: 'id' })
      }
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
    closeDb()

    await expect(openDb()).rejects.toBeInstanceOf(StorageUnavailable)
    await resetStorage()

    // And afterwards the product works, on an empty profile.
    const db = await openDb()
    expect(db.version).toBe(4)
    expect(await db.getAll('findings')).toEqual([])
  })
})
