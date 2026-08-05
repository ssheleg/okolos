import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { closeDb, openDb } from './db.js'
import { createModelCache } from './model-cache.js'

const NOW = '2026-08-05T12:00:00.000Z'

async function cache() {
  return createModelCache({ db: await openDb(), now: () => NOW })
}

beforeEach(() => {
  indexedDB.deleteDatabase('okolos')
  closeDb()
})

afterEach(() => {
  closeDb()
})

describe('keeping weights', () => {
  it('gives back exactly what it was handed', async () => {
    const c = await cache()
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer
    await c.write('guard', '1', bytes)
    const read = await c.read('guard', '1')
    expect(read && new Uint8Array(read)).toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  it('has nothing for a version it was never given', async () => {
    const c = await cache()
    await c.write('guard', '1', new Uint8Array([1]).buffer)
    await expect(c.read('guard', '2')).resolves.toBeNull()
  })

  it('keeps versions apart rather than overwriting', async () => {
    const c = await cache()
    await c.write('guard', '1', new Uint8Array([1]).buffer)
    await c.write('guard', '2', new Uint8Array([2]).buffer)
    const first = await c.read('guard', '1')
    expect(first && new Uint8Array(first)).toEqual(new Uint8Array([1]))
  })

  it('clears every version of a model, not just the newest', async () => {
    // Two builds of a classifier in one cache is a bug nobody notices until
    // their verdicts disagree.
    const c = await cache()
    await c.write('guard', '1', new Uint8Array([1]).buffer)
    await c.write('guard', '2', new Uint8Array([2]).buffer)
    await c.clear('guard')
    await expect(c.read('guard', '1')).resolves.toBeNull()
    await expect(c.read('guard', '2')).resolves.toBeNull()
  })

  it('leaves another model alone when clearing one', async () => {
    const c = await cache()
    await c.write('guard', '1', new Uint8Array([1]).buffer)
    await c.write('other', '1', new Uint8Array([9]).buffer)
    await c.clear('guard')
    await expect(c.read('other', '1')).resolves.not.toBeNull()
  })
})

describe('weights are the user’s data too', () => {
  it('are erased by a wipe, like everything else', async () => {
    const { wipeAll } = await import('./export.js')
    const db = await openDb()
    const c = createModelCache({ db, now: () => NOW })
    await c.write('guard', '1', new Uint8Array([1]).buffer)

    await wipeAll(db)
    await expect(c.read('guard', '1')).resolves.toBeNull()
  })
})
