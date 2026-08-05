import { describe, expect, it, vi } from 'vitest'

import {
  assessAction,
  resolveGate,
  type AgentAction,
  type GateAssessment,
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

function asked(assessment: GateAssessment): assessment is Extract<GateAssessment, { ask: true }> {
  return assessment.ask
}

describe('when the gate stays out of the way', () => {
  it('does not open on a page with nothing unresolved', () => {
    // The gate is scoped to compromised pages. Opening it anywhere else would
    // make the product unusable, and an unusable guard gets uninstalled.
    const assessment = assessAction(action(), [])
    expect(assessment.ask).toBe(false)
    if (!asked(assessment)) {
      expect(assessment.decision.outcome).toBe('ungated')
      expect(assessment.decision.reason).toBe('no-finding')
    }
  })

  it('does not open on a finding the user already handled', () => {
    // Callers pass unresolved findings only; an empty list is the resolved case.
    expect(assessAction(action(), []).ask).toBe(false)
  })

  it('lets a person act on their own page', () => {
    // A human who clicks their own button has already made the decision the
    // gate exists to obtain. Only actions no human initiated are held.
    const assessment = assessAction(action({ humanGesture: true }), [FINDING])
    expect(assessment.ask).toBe(false)
    if (!asked(assessment)) expect(assessment.decision.reason).toBe('human-gesture')
  })
})

describe('when the gate opens', () => {
  it('holds a scripted action on a page with an unresolved finding', () => {
    const assessment = assessAction(action(), [FINDING])
    expect(assessment.ask).toBe(true)
    if (asked(assessment)) expect(assessment.findings).toEqual([FINDING])
  })

  it('names the action and the finding, so the modal has something to say', () => {
    const assessment = assessAction(action(), [FINDING])
    if (asked(assessment)) {
      expect(assessment.action.description).toBe('Submit the payment form')
      expect(assessment.findings[0]?.summary).toContain('approve a transfer')
    }
  })
})

describe('an action nobody can identify', () => {
  it('is blocked without asking — there is no question to put to the user', () => {
    const assessment = assessAction(action({ kind: 'unknown' }), [FINDING])
    expect(assessment.ask).toBe(false)
    if (!asked(assessment)) {
      expect(assessment.decision.outcome).toBe('blocked')
      expect(assessment.decision.reason).toBe('unidentified')
    }
  })

  it('says what could not be determined rather than failing mutely', () => {
    const assessment = assessAction(action({ kind: 'unknown' }), [FINDING])
    if (!asked(assessment)) expect(assessment.decision.explain).toMatch(/what kind of action/i)
  })

  it('treats a blank description the same way', () => {
    const assessment = assessAction(action({ description: '   ' }), [FINDING])
    if (!asked(assessment)) expect(assessment.decision.reason).toBe('unidentified')
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
