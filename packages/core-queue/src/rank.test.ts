import { describe, expect, it } from 'vitest'

import { buildQueue, QUEUE_LIMIT, type QueueItem } from './rank.js'

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: 'i1',
    severity: 'minor',
    createdAt: '2026-08-01T00:00:00.000Z',
    fixability: 'guided',
    summary: 'Something was found',
    ...overrides,
  }
}

/** An item whose action registry entry could not be read. */
function unrankable(overrides: Partial<QueueItem> = {}): QueueItem {
  const full = item(overrides)
  return {
    id: full.id,
    severity: full.severity,
    createdAt: full.createdAt,
    summary: full.summary,
  }
}

function many(count: number): QueueItem[] {
  return Array.from({ length: count }, (_, index) =>
    item({ id: `i${index}`, summary: `Finding ${index}` }),
  )
}

describe('the queue is always finishable', () => {
  it('shows three items and no more, whatever it is given', () => {
    // This is the anti-pattern the product exists to avoid: 203 alerts
    // presented as progress. Three is a list a person can finish today.
    const queue = buildQueue(many(50))
    expect(queue.shown).toHaveLength(QUEUE_LIMIT)
    expect(QUEUE_LIMIT).toBe(3)
  })

  it('says how many it is holding back rather than hiding the number', () => {
    expect(buildQueue(many(10)).hidden).toBe(7)
  })

  it('pads nothing when there are fewer than three', () => {
    const queue = buildQueue(many(2))
    expect(queue.shown).toHaveLength(2)
    expect(queue.hidden).toBe(0)
  })

  it('is empty, not broken, when nothing is outstanding', () => {
    expect(buildQueue([])).toEqual({ shown: [], hidden: 0, rankedBy: 'full' })
  })
})

describe('what comes first', () => {
  it('puts the worst thing at the top', () => {
    const queue = buildQueue([
      item({ id: 'minor', severity: 'minor' }),
      item({ id: 'critical', severity: 'critical' }),
      item({ id: 'major', severity: 'major' }),
    ])
    expect(queue.shown.map((entry) => entry.id)).toEqual(['critical', 'major', 'minor'])
  })

  it('prefers the fixable one when severity ties', () => {
    // Between two equal problems, the one that can be finished in a click is
    // the one a person will actually do.
    const queue = buildQueue([
      item({ id: 'manual', fixability: 'manual' }),
      item({ id: 'quick', fixability: 'one-click' }),
    ])
    expect(queue.shown[0]?.id).toBe('quick')
  })

  it('prefers the newer one when severity and fixability tie', () => {
    const queue = buildQueue([
      item({ id: 'old', createdAt: '2026-07-01T00:00:00.000Z' }),
      item({ id: 'new', createdAt: '2026-08-01T00:00:00.000Z' }),
    ])
    expect(queue.shown[0]?.id).toBe('new')
  })

  it('never depends on the order it was handed', () => {
    const items = [
      item({ id: 'a', severity: 'minor' }),
      item({ id: 'b', severity: 'critical' }),
      item({ id: 'c', severity: 'major' }),
    ]
    const forwards = buildQueue(items).shown.map((entry) => entry.id)
    const backwards = buildQueue([...items].reverse()).shown.map((entry) => entry.id)
    expect(backwards).toEqual(forwards)
  })

  it('does not mutate what it was given', () => {
    const items = [item({ id: 'a', severity: 'minor' }), item({ id: 'b', severity: 'critical' })]
    buildQueue(items)
    expect(items.map((entry) => entry.id)).toEqual(['a', 'b'])
  })
})

describe('when the ranking data is incomplete', () => {
  it('falls back to severity alone and says so', () => {
    const queue = buildQueue([
      unrankable({ id: 'a', severity: 'major' }),
      item({ id: 'b', severity: 'critical' }),
    ])
    expect(queue.rankedBy).toBe('severity-only')
    expect(queue.shown[0]?.id).toBe('b')
  })

  it('reports a full ranking when every item can be ranked', () => {
    expect(buildQueue(many(3)).rankedBy).toBe('full')
  })

  it('still returns a deterministic order in the reduced basis', () => {
    const items = [
      unrankable({ id: 'a', severity: 'major' }),
      item({ id: 'b', severity: 'major' }),
    ]
    const first = buildQueue(items).shown.map((entry) => entry.id)
    expect(buildQueue([...items].reverse()).shown.map((entry) => entry.id)).toEqual(first)
  })
})

describe('resolving the top item', () => {
  it('promotes the next one, and the count of hidden items drops', () => {
    const items = many(5)
    const before = buildQueue(items)
    const after = buildQueue(items.filter((entry) => entry.id !== before.shown[0]?.id))

    expect(after.shown).toHaveLength(3)
    expect(after.shown.map((entry) => entry.id)).not.toContain(before.shown[0]?.id)
    expect(after.hidden).toBe(1)
  })
})
