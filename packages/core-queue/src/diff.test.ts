import { describe, expect, it } from 'vitest'

import { diffSince, type JournalEntry } from './diff.js'

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'e1',
    createdAt: '2026-08-02T12:00:00.000Z',
    kind: 'verdict',
    summary: 'Hidden instruction found on example.test',
    automatic: true,
    ...overrides,
  }
}

const LAST_CHECK = '2026-08-02T00:00:00.000Z'

describe('what changed since last time', () => {
  it('shows only what happened after the last check', () => {
    const diff = diffSince(
      [
        entry({ id: 'old', createdAt: '2026-08-01T23:59:59.000Z' }),
        entry({ id: 'new', createdAt: '2026-08-02T00:00:01.000Z' }),
      ],
      LAST_CHECK,
    )
    expect(diff.total).toBe(1)
    expect(diff.groups[0]?.entries[0]?.id).toBe('new')
  })

  it('treats an entry at the exact moment of the last check as already seen', () => {
    expect(diffSince([entry({ createdAt: LAST_CHECK })], LAST_CHECK).total).toBe(0)
  })

  it('counts everything as new on a first-ever check', () => {
    expect(diffSince([entry(), entry({ id: 'e2' })], null).total).toBe(2)
  })

  it('groups by kind so the list reads as a summary, not a stream', () => {
    const diff = diffSince(
      [
        entry({ id: 'a', kind: 'verdict' }),
        entry({ id: 'b', kind: 'action' }),
        entry({ id: 'c', kind: 'verdict' }),
      ],
      LAST_CHECK,
    )
    expect(diff.groups.map((group) => group.kind)).toEqual(['verdict', 'action'])
    expect(diff.groups[0]?.entries).toHaveLength(2)
  })

  it('leaves out groups with nothing in them', () => {
    const diff = diffSince([entry({ kind: 'action' })], LAST_CHECK)
    expect(diff.groups).toHaveLength(1)
  })

  it('puts the newest first inside a group', () => {
    const diff = diffSince(
      [
        entry({ id: 'older', createdAt: '2026-08-02T01:00:00.000Z' }),
        entry({ id: 'newer', createdAt: '2026-08-02T09:00:00.000Z' }),
      ],
      LAST_CHECK,
    )
    expect(diff.groups[0]?.entries.map((item) => item.id)).toEqual(['newer', 'older'])
  })
})

describe('the empty state is a statement, not a blank', () => {
  it('carries the time of the last check so the emptiness means something', () => {
    const diff = diffSince([], LAST_CHECK)
    expect(diff.total).toBe(0)
    expect(diff.since).toBe(LAST_CHECK)
  })

  it('says there was no previous check rather than inventing one', () => {
    expect(diffSince([], null).since).toBeNull()
  })
})

describe('when part of the journal cannot be read', () => {
  it('says the view is incomplete instead of passing it off as everything', () => {
    // A short list that silently omits records reads as "little happened",
    // which is a claim the product must not make when it does not know.
    const diff = diffSince([entry()], LAST_CHECK, { unreadable: 4 })
    expect(diff.incomplete).toBe(true)
    expect(diff.unreadable).toBe(4)
  })

  it('is complete when nothing was lost', () => {
    expect(diffSince([entry()], LAST_CHECK).incomplete).toBe(false)
  })
})

describe('full history', () => {
  it('is what you get by asking since the beginning', () => {
    const entries = [
      entry({ id: 'a', createdAt: '2026-07-01T00:00:00.000Z' }),
      entry({ id: 'b', createdAt: '2026-08-02T09:00:00.000Z' }),
    ]
    expect(diffSince(entries, null).total).toBe(2)
  })
})

describe('the diff is a description, not an act', () => {
  it('is pure: the same journal gives the same diff', () => {
    const entries = [entry(), entry({ id: 'e2', kind: 'action' })]
    expect(diffSince(entries, LAST_CHECK)).toEqual(diffSince(entries, LAST_CHECK))
  })

  it('does not mutate the journal it was handed', () => {
    const entries = [entry({ id: 'a' }), entry({ id: 'b', createdAt: '2026-08-03T00:00:00.000Z' })]
    diffSince(entries, LAST_CHECK)
    expect(entries.map((item) => item.id)).toEqual(['a', 'b'])
  })
})
