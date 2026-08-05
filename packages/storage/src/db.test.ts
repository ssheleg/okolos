/** @vitest-environment node */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { DB_NAME, STORES } from './schema.js'
import { closeDb, openDb } from './db.js'
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

    const dump = JSON.parse(await exportAll(db)) as Record<string, unknown[]>

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
