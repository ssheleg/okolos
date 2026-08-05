import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDb, openDb } from '@okolos/storage'
import type { ExtensionSnapshot } from '@okolos/core-extensions'

import { reviewInventory } from './extensions.js'

const NOW = '2026-08-05T12:00:00.000Z'

function ext(overrides: Partial<ExtensionSnapshot> = {}): ExtensionSnapshot {
  return {
    id: 'abc',
    name: 'Colour Picker',
    version: '1.0.0',
    permissions: ['storage'],
    hostPermissions: [],
    publisher: 'Someone',
    enabled: true,
    ...overrides,
  }
}

async function review(list: ExtensionSnapshot[]) {
  return reviewInventory({ db: await openDb(), list: async () => list, now: () => NOW, selfId: 'self' })
}

beforeEach(() => {
  indexedDB.deleteDatabase('okolos')
  closeDb()
})

describe('the first run', () => {
  it('records what is installed without calling any of it a change', async () => {
    // Reporting every installed extension as new would bury the one that
    // matters under the twenty that do not.
    expect(await review([ext(), ext({ id: 'def' })])).toEqual([])
    const db = await openDb()
    expect(await db.getAll('snapshots')).toHaveLength(2)
  })
})

describe('the run after that', () => {
  it('reports a permission that appeared', async () => {
    await review([ext()])
    const changes = await review([ext({ permissions: ['storage', 'cookies'] })])
    expect(changes[0]).toMatchObject({ kind: 'permission-added' })
  })

  it('reports a change of publisher', async () => {
    await review([ext()])
    const changes = await review([ext({ publisher: 'New Owner' })])
    expect(changes[0]).toMatchObject({ kind: 'publisher-changed' })
  })

  it('writes what it found to the journal', async () => {
    await review([ext()])
    await review([ext({ publisher: 'New Owner' })])
    const db = await openDb()
    const journal = await db.getAll('journal')
    expect(journal.some((entry) => String(entry.detail?.kind) === 'publisher-changed')).toBe(true)
  })

  it('says nothing the second time about a change already reported', async () => {
    // The snapshot is written after the comparison, so the new state becomes
    // the baseline and the same change is not reported forever.
    await review([ext()])
    await review([ext({ publisher: 'New Owner' })])
    expect(await review([ext({ publisher: 'New Owner' })])).toEqual([])
  })

  it('leaves this extension out of its own report', async () => {
    await review([ext()])
    const changes = await review([ext(), ext({ id: 'self', permissions: ['storage', 'tabs'] })])
    expect(changes.every((change) => change.id !== 'self')).toBe(true)
  })
})
