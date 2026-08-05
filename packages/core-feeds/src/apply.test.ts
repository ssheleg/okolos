import { describe, expect, it, vi } from 'vitest'

import { applyUpdate, serialiseUpdate, type FeedSnapshot, type SignedUpdate } from './apply.js'

const CURRENT: FeedSnapshot = {
  name: 'phishing',
  version: 7,
  updatedAt: '2026-08-01T00:00:00.000Z',
  entries: ['bad.test', 'worse.test'],
}

const good = vi.fn(async () => true)
const bad = vi.fn(async () => false)

function snapshot(overrides: Partial<FeedSnapshot> = {}): SignedUpdate {
  return {
    update: { kind: 'snapshot', body: { ...CURRENT, version: 8, ...overrides } },
    signature: 'sig',
  }
}

function delta(overrides: Partial<Parameters<typeof deltaBody>[0]> = {}): SignedUpdate {
  return { update: { kind: 'delta', body: deltaBody(overrides) }, signature: 'sig' }
}

function deltaBody(overrides: {
  name?: string
  base?: number
  version?: number
  added?: string[]
  removed?: string[]
} = {}) {
  return {
    name: 'phishing',
    base: 7,
    version: 8,
    updatedAt: '2026-08-05T00:00:00.000Z',
    added: ['new.test'],
    removed: [],
    ...overrides,
  }
}

describe('an update that does not verify', () => {
  it('is refused', async () => {
    const outcome = await applyUpdate(CURRENT, snapshot(), bad)
    expect(outcome.accepted).toBe(false)
  })

  it('leaves the last verified feed in force, not an empty one', async () => {
    // Failing to a previous good state is the point. Failing to no feed would
    // turn protection off without saying so.
    const outcome = await applyUpdate(CURRENT, snapshot(), bad)
    if (!outcome.accepted) {
      expect(outcome.kept).toBe(CURRENT)
      expect(outcome.explain).toContain('7')
    }
  })

  it('says plainly when there is nothing to fall back to', async () => {
    const outcome = await applyUpdate(null, snapshot(), bad)
    if (!outcome.accepted) {
      expect(outcome.kept).toBeNull()
      expect(outcome.explain).toMatch(/no earlier copy/i)
    }
  })

  it('checks the signature before anything else about the body', async () => {
    const verify = vi.fn(async () => false)
    await applyUpdate(CURRENT, delta({ base: 999 }), verify)
    expect(verify).toHaveBeenCalledTimes(1)
  })
})

describe('a verified snapshot', () => {
  it('replaces what was in force', async () => {
    const outcome = await applyUpdate(CURRENT, snapshot({ entries: ['only.test'] }), good)
    expect(outcome.accepted && outcome.snapshot.entries).toEqual(['only.test'])
  })

  it('is refused when it is not newer, however well signed', async () => {
    // A genuine old update, replayed by someone in the middle, is how a fixed
    // entry gets un-fixed. Valid signature is exactly why this check exists.
    const outcome = await applyUpdate(CURRENT, snapshot({ version: 7 }), good)
    expect(outcome.accepted).toBe(false)
    if (!outcome.accepted) expect(outcome.reason).toBe('not-newer')
  })

  it('is refused when it belongs to another feed', async () => {
    const outcome = await applyUpdate(CURRENT, snapshot({ name: 'malware' }), good)
    if (!outcome.accepted) expect(outcome.reason).toBe('wrong-feed')
  })

  it('is accepted on a first run, when nothing is in force yet', async () => {
    const outcome = await applyUpdate(null, snapshot(), good)
    expect(outcome.accepted).toBe(true)
  })
})

describe('a verified delta', () => {
  it('adds and removes against the version it was built for', async () => {
    const outcome = await applyUpdate(
      CURRENT,
      delta({ added: ['new.test'], removed: ['bad.test'] }),
      good,
    )
    expect(outcome.accepted && outcome.snapshot.entries).toEqual(['worse.test', 'new.test'])
    expect(outcome.accepted && outcome.snapshot.version).toBe(8)
  })

  it('is refused across a gap', async () => {
    // Applying a delta onto the wrong base produces a feed nobody has tested.
    const outcome = await applyUpdate(CURRENT, delta({ base: 5 }), good)
    if (!outcome.accepted) {
      expect(outcome.reason).toBe('wrong-base')
      expect(outcome.kept).toBe(CURRENT)
    }
  })

  it('is refused when there is no full feed to apply it to', async () => {
    const outcome = await applyUpdate(null, delta(), good)
    if (!outcome.accepted) expect(outcome.reason).toBe('no-current')
  })

  it('does not duplicate an entry that is added twice', async () => {
    const outcome = await applyUpdate(CURRENT, delta({ added: ['bad.test'] }), good)
    expect(outcome.accepted && outcome.snapshot.entries).toEqual(['bad.test', 'worse.test'])
  })

  it('keeps the feed name from what was in force', async () => {
    const outcome = await applyUpdate(CURRENT, delta(), good)
    expect(outcome.accepted && outcome.snapshot.name).toBe('phishing')
  })
})

describe('what gets signed', () => {
  it('is stable regardless of key order in the object', async () => {
    const a = serialiseUpdate({ kind: 'snapshot', body: { ...CURRENT } })
    const b = serialiseUpdate({
      kind: 'snapshot',
      body: {
        entries: CURRENT.entries,
        updatedAt: CURRENT.updatedAt,
        version: CURRENT.version,
        name: CURRENT.name,
      },
    })
    expect(b).toBe(a)
  })

  it('changes when a single entry changes, so a tampered body cannot pass', async () => {
    const a = serialiseUpdate({ kind: 'snapshot', body: CURRENT })
    const b = serialiseUpdate({ kind: 'snapshot', body: { ...CURRENT, entries: ['other.test'] } })
    expect(b).not.toBe(a)
  })

  it('distinguishes a snapshot from a delta with the same numbers', () => {
    const asSnapshot = serialiseUpdate({ kind: 'snapshot', body: CURRENT })
    const asDelta = serialiseUpdate({ kind: 'delta', body: deltaBody() })
    expect(asDelta).not.toBe(asSnapshot)
  })
})
