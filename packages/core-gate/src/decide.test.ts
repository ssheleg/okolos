import { describe, expect, it, vi } from 'vitest'

import {
  assessAction,
  resolveGate,
  type AgentAction,
  type GateAssessment,
  type GateDecision,
  type UnresolvedFinding,
} from './decide.js'

const FINDING: UnresolvedFinding = {
  id: 'f1',
  summary: 'Hidden text on this page instructs an assistant to approve a transfer',
}

function action(overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    id: 'a1',
    kind: 'form-submit',
    description: 'Submit the payment form',
    target: 'https://shop.test/checkout',
    humanGesture: false,
    ...overrides,
  }
}

/** A gate the user never answers. */
const never = () => new Promise<never>(() => {})
const pending = new Promise<void>(() => {})

/**
 * Narrows and asserts in one move.
 *
 * The obvious idiom — `if (!assessment.ask) { expect(...) }` — type-checks and
 * quietly stops testing the moment the branch is not taken: nothing inside runs
 * and the test still passes. These throw instead, so a wrong shape is a failure
 * with a sentence rather than an absence of assertions.
 */
function settled(assessment: GateAssessment): GateDecision {
  if (assessment.ask) {
    throw new Error('expected an assessment that settles on its own, got one that asks a human')
  }
  return assessment.decision
}

function asking(assessment: GateAssessment): Extract<GateAssessment, { ask: true }> {
  if (!assessment.ask) {
    throw new Error(
      `expected the gate to ask, but it settled: ${assessment.decision.reason}`,
    )
  }
  return assessment
}

describe('when the gate stays out of the way', () => {
  it('does not open on a page with nothing unresolved', () => {
    // The gate is scoped to compromised pages. Opening it anywhere else would
    // make the product unusable, and an unusable guard gets uninstalled.
    const decision = settled(assessAction(action(), []))
    expect(decision.outcome).toBe('ungated')
    expect(decision.reason).toBe('no-finding')
  })

  it('does not open on a finding the user already handled', () => {
    // Callers pass unresolved findings only; an empty list is the resolved case.
    expect(assessAction(action(), []).ask).toBe(false)
  })

  it('lets a person act on their own page', () => {
    // A human who clicks their own button has already made the decision the
    // gate exists to obtain. Only actions no human initiated are held.
    expect(settled(assessAction(action({ humanGesture: true }), [FINDING])).reason).toBe(
      'human-gesture',
    )
  })
})

describe('when the gate opens', () => {
  it('holds a scripted action on a page with an unresolved finding', () => {
    expect(asking(assessAction(action(), [FINDING])).findings).toEqual([FINDING])
  })

  it('names the action and the finding, so the modal has something to say', () => {
    const assessment = asking(assessAction(action(), [FINDING]))
    expect(assessment.action.description).toBe('Submit the payment form')
    expect(assessment.findings[0]?.summary).toContain('approve a transfer')
  })
})

describe('an action nobody can identify', () => {
  it('is blocked without asking — there is no question to put to the user', () => {
    const decision = settled(assessAction(action({ kind: 'unknown' }), [FINDING]))
    expect(decision.outcome).toBe('blocked')
    expect(decision.reason).toBe('unidentified')
  })

  it('says what could not be determined rather than failing mutely', () => {
    expect(settled(assessAction(action({ kind: 'unknown' }), [FINDING])).explain).toMatch(
      /what kind of action/i,
    )
  })

  it('treats a blank description the same way', () => {
    expect(settled(assessAction(action({ description: '   ' }), [FINDING])).reason).toBe(
      'unidentified',
    )
  })
})

describe('the default is Block', () => {
  it('blocks when the user does not answer in time', async () => {
    const expiry = Promise.resolve()
    const assessment = assessAction(action(), [FINDING])
    const decision = await resolveGate(assessment, never, expiry)

    expect(decision.outcome).toBe('blocked')
    expect(decision.reason).toBe('timeout')
  })

  it('blocks when the gate itself cannot be shown', async () => {
    // A gate that fails to open must not become a gate that waves things
    // through — the failure mode has to be the safe one.
    const assessment = assessAction(action(), [FINDING])
    const decision = await resolveGate(
      assessment,
      async () => {
        throw new Error('no window to draw in')
      },
      pending,
    )

    expect(decision.outcome).toBe('blocked')
    expect(decision.reason).toBe('unavailable')
    expect(decision.explain).toContain('no window to draw in')
  })

  it('never turns a timeout into an allow, even if the answer arrives late', async () => {
    let answer: (choice: 'allow-once') => void = () => {}
    const assessment = assessAction(action(), [FINDING])
    const decision = await resolveGate(
      assessment,
      () => new Promise((resolve) => (answer = resolve)),
      Promise.resolve(),
    )
    answer('allow-once')

    expect(decision.outcome).toBe('blocked')
  })
})

describe('what the user chose', () => {
  it('blocks on Block', async () => {
    const assessment = assessAction(action(), [FINDING])
    const decision = await resolveGate(assessment, async () => 'block', pending)
    expect(decision).toMatchObject({ outcome: 'blocked', reason: 'user-blocked' })
  })

  it('allows on Allow once', async () => {
    const assessment = assessAction(action(), [FINDING])
    const decision = await resolveGate(assessment, async () => 'allow-once', pending)
    expect(decision).toMatchObject({ outcome: 'allowed-once', reason: 'user-allowed' })
  })

  it('does not ask again about a decision already made', async () => {
    const ask = vi.fn()
    const settled = assessAction(action(), [])
    await resolveGate(settled, ask, pending)
    expect(ask).not.toHaveBeenCalled()
  })

  it('is once — the next action from the same page gets its own gate', () => {
    // "Allow once" is a decision about one action, not a licence for the page.
    const first = assessAction(action({ id: 'a1' }), [FINDING])
    const second = assessAction(action({ id: 'a2' }), [FINDING])
    expect(first.ask).toBe(true)
    expect(second.ask).toBe(true)
  })
})

describe('every decision is journallable', () => {
  it('carries the action it was about', async () => {
    const assessment = assessAction(action({ id: 'a9' }), [FINDING])
    const decision = await resolveGate(assessment, async () => 'block', pending)
    expect(decision.actionId).toBe('a9')
  })

  it('carries the findings that caused the gate', async () => {
    const second: UnresolvedFinding = { id: 'f2', summary: 'A second hidden instruction' }
    const assessment = assessAction(action(), [FINDING, second])
    const decision = await resolveGate(assessment, async () => 'allow-once', pending)
    expect(decision.findingIds).toEqual(['f1', 'f2'])
  })

  it('always explains itself in a sentence', async () => {
    const outcomes = await Promise.all([
      resolveGate(assessAction(action(), [FINDING]), async () => 'block', pending),
      resolveGate(assessAction(action(), [FINDING]), async () => 'allow-once', pending),
      resolveGate(assessAction(action(), [FINDING]), never, Promise.resolve()),
      resolveGate(assessAction(action({ kind: 'unknown' }), [FINDING]), never, pending),
      resolveGate(assessAction(action(), []), never, pending),
    ])
    for (const decision of outcomes) expect(decision.explain.length).toBeGreaterThan(10)
  })
})

describe('the assessment is a description, not an act', () => {
  it('is pure: the same action and findings give the same assessment', () => {
    expect(assessAction(action(), [FINDING])).toEqual(assessAction(action(), [FINDING]))
  })
})
