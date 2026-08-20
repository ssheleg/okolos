import { describe, expect, it, vi } from 'vitest'

import {
  applyUpdate,
  serialiseUpdate,
  type FeedSnapshot,
  type SignedUpdate,
  type UpdateOutcome,
} from './apply.js'

const CURRENT: FeedSnapshot = {
  name: 'phishing',
  version: 7,
  updatedAt: '2026-08-01T00:00:00.000Z',
  entries: ['bad.test', 'worse.test'],
}

const good = vi.fn(async () => true)
const bad = vi.fn(async () => false)

/**
 * Narrow and assert together.
 *
 * `if (!outcome.accepted) { expect(...) }` type-checks and stops testing the
 * moment the branch is not taken — the assertions inside simply do not run and
 * the test passes anyway. Throwing puts the wrong shape on the screen instead.
 */
function refusal(outcome: UpdateOutcome): Extract<UpdateOutcome, { accepted: false }> {
  if (outcome.accepted) {
    throw new Error(`expected a refusal, but version ${outcome.snapshot.version} was accepted`)
  }
  return outcome
}

function accepted(outcome: UpdateOutcome): FeedSnapshot {
  if (!outcome.accepted) throw new Error(`expected acceptance, but it was refused: ${outcome.reason}`)
  return outcome.snapshot
}

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
    const outcome = refusal(await applyUpdate(CURRENT, snapshot(), bad))
    expect(outcome.kept).toBe(CURRENT)
    // What survives is `kept`, not a sentence mentioning its version. The sentence is
    // written where the catalogue is, and asserted in `background/feed-words.test.ts`.
    expect(outcome.reason).toBe('bad-signature')
  })

  it('reports nothing to fall back to as a null, not as prose about it', async () => {
    // The distinction that used to live in two English sentences chosen here: with
    // nothing kept there is no version to name, so the surface picks a different message
    // rather than substituting an empty string into the usual one.
    const outcome = refusal(await applyUpdate(null, snapshot(), bad))
    expect(outcome.kept).toBeNull()
    expect(outcome.reason).toBe('bad-signature')
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
    expect(accepted(outcome).entries).toEqual(['only.test'])
  })

  it('is refused when it is not newer, however well signed', async () => {
    // A genuine old update, replayed by someone in the middle, is how a fixed
    // entry gets un-fixed. Valid signature is exactly why this check exists.
    expect(refusal(await applyUpdate(CURRENT, snapshot({ version: 7 }), good)).reason).toBe(
      'not-newer',
    )
  })

  it('is refused when it belongs to another feed', async () => {
    expect(refusal(await applyUpdate(CURRENT, snapshot({ name: 'malware' }), good)).reason).toBe(
      'wrong-feed',
    )
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
    expect(accepted(outcome).entries).toEqual(['worse.test', 'new.test'])
    expect(accepted(outcome).version).toBe(8)
  })

  it('is refused across a gap', async () => {
    // Applying a delta onto the wrong base produces a feed nobody has tested.
    const outcome = refusal(await applyUpdate(CURRENT, delta({ base: 5 }), good))
    expect(outcome.reason).toBe('wrong-base')
    expect(outcome.kept).toBe(CURRENT)
  })

  it('is refused when there is no full feed to apply it to', async () => {
    expect(refusal(await applyUpdate(null, delta(), good)).reason).toBe('no-current')
  })

  it('does not duplicate an entry that is added twice', async () => {
    const outcome = await applyUpdate(CURRENT, delta({ added: ['bad.test'] }), good)
    expect(accepted(outcome).entries).toEqual(['bad.test', 'worse.test'])
  })

  it('keeps the feed name from what was in force', async () => {
    const outcome = await applyUpdate(CURRENT, delta(), good)
    expect(accepted(outcome).name).toBe('phishing')
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

describe('a version that is not a version', () => {
  /**
   * The replay guard is `version <= current.version`, and every comparison
   * against NaN is false. A single update carrying `version: NaN` is therefore
   * accepted — and once NaN is what is in force, *every* later update passes
   * the same check, including a replay of the entry that was fixed last week.
   *
   * It needs a valid signature, so this is not an unauthenticated attack. It
   * is what one `parseInt(undefined)` in the publishing pipeline does to every
   * client permanently, and the guard cannot recover on its own because the
   * guard is what broke.
   */
  const good = (version: number) => ({
    kind: 'snapshot' as const,
    body: { name: 'phish', version, updatedAt: '2026-08-07T00:00:00.000Z', entries: ['a.test'] },
  })
  const current = {
    name: 'phish',
    version: 5,
    updatedAt: '2026-08-01T00:00:00.000Z',
    entries: ['old.test'],
  }
  const yes = async () => true

  it('refuses NaN rather than letting it through the comparison', async () => {
    const out = await applyUpdate(current, { update: good(NaN), signature: 'x' }, yes)
    expect(out.accepted).toBe(false)
    expect(out.accepted === false && out.kept).toEqual(current)
  })

  it('refuses Infinity, which would leave no version above it', async () => {
    const out = await applyUpdate(current, { update: good(Infinity), signature: 'x' }, yes)
    expect(out.accepted).toBe(false)
  })

  it('refuses a version past the safe integer range', async () => {
    // Beyond 2^53 the arithmetic stops distinguishing neighbours, so "newer"
    // stops meaning anything.
    const out = await applyUpdate(
      current,
      { update: good(Number.MAX_SAFE_INTEGER), signature: 'x' },
      yes,
    )
    expect(out.accepted).toBe(false)
  })

  it('refuses a fractional version', async () => {
    const out = await applyUpdate(current, { update: good(5.5), signature: 'x' }, yes)
    expect(out.accepted).toBe(false)
  })

  it('refuses a negative version even with nothing in force', async () => {
    const out = await applyUpdate(null, { update: good(-1), signature: 'x' }, yes)
    expect(out.accepted).toBe(false)
  })

  it('still accepts an ordinary newer version', async () => {
    // The check must not start refusing the product's own feeds.
    const out = await applyUpdate(current, { update: good(6), signature: 'x' }, yes)
    expect(out.accepted).toBe(true)
  })

  it('recovers from a stored version that is already unusable', async () => {
    // Infinity, not NaN. A stored NaN recovers on its own — every comparison
    // against it is false, so a sane update is never refused — and a test
    // using it proves nothing about the guard. A stored Infinity is the case
    // that needs it: `3 <= Infinity` is true, so without the guard the client
    // refuses every update it will ever be offered, permanently.
    const frozen = { ...current, version: Infinity }
    const out = await applyUpdate(frozen, { update: good(1), signature: 'x' }, yes)
    expect(out.accepted, 'a client with a stored Infinity can never be updated again').toBe(true)
  })

  it('a stored NaN also lets a sane update through', async () => {
    // Recorded because it recovers for a different reason than the one above,
    // and reading them as the same case is how the guard gets removed.
    const poisoned = { ...current, version: NaN }
    const out = await applyUpdate(poisoned, { update: good(1), signature: 'x' }, yes)
    expect(out.accepted).toBe(true)
  })
})
