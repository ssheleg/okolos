import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { decideAction } from './policy.js'
import type { Confidence, Evidence, Stage, Verdict, VerdictCategory } from './verdict.js'

const CATEGORIES: VerdictCategory[] = [
  'injection',
  'phishing',
  'lookalike',
  'clickfix',
  'techsupport',
  'download',
  'credential',
  'password',
  'extension',
  'leak',
]

const STAGES: Stage[] = ['diff', 'rules', 'model', 'feed', 'inventory', 'corpus']

function evidence(stage: Stage): Evidence {
  return { kind: 'hidden-text', stage, detail: {} }
}

describe('decideAction — the confidence ladder', () => {
  it('blocks only on certainty', () => {
    expect(decideAction({ confidence: 'certain', evidence: [evidence('feed')] })).toBe('block')
  })

  it('sanitises and warns on the deterministic stages', () => {
    expect(decideAction({ confidence: 'high', evidence: [evidence('diff')] })).toBe('sanitize')
  })

  it('only informs on rules', () => {
    expect(decideAction({ confidence: 'medium', evidence: [evidence('rules')] })).toBe('inform')
  })

  it('stays silent on the model alone', () => {
    expect(decideAction({ confidence: 'low', evidence: [evidence('model')] })).toBe('silent')
  })
})

describe('the model never acts alone', () => {
  // This is the guarantee we hold competitors to: a classifier verdict with no
  // deterministic evidence behind it must never block a page or rewrite a DOM,
  // whatever confidence the caller claims for it.
  it('refuses block and sanitize when every piece of evidence came from the model', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Confidence>('certain', 'high', 'medium', 'low'),
        fc.array(fc.constant(evidence('model')), { minLength: 1, maxLength: 5 }),
        (confidence, modelOnly) => {
          const action = decideAction({ confidence, evidence: modelOnly })
          return action !== 'block' && action !== 'sanitize' && action !== 'gate'
        },
      ),
    )
  })

  it('allows decisive action as soon as one deterministic stage backs it', () => {
    const mixed = [evidence('model'), evidence('diff')]
    expect(decideAction({ confidence: 'high', evidence: mixed })).toBe('sanitize')
  })
})

/**
 * The ladder is a ladder: no step ever hands out a weaker answer than the step below it.
 *
 * Four checks exist above for the four rungs, one input each. What none of them can see is
 * the shape *between* them — that raising confidence never softens the action, and that
 * adding deterministic evidence never softens it either. A reordered `switch`, a case that
 * falls through, a new confidence value slotted in the middle: each would keep every
 * example above green while inverting the property the whole product rests on.
 *
 * **The order is declared here rather than exported**, and that is deliberate. Nothing in
 * the product compares two actions — severities are compared, actions are chosen — so an
 * exported `ACTION_ORDER` would be vocabulary with no writer, the exact defect removed from
 * the journal's kinds on 2026-08-20. The intensity order is a property of *this policy*,
 * so it lives with the test that asserts it.
 */
describe('the ladder never leans backwards', () => {
  /** Rising intensity: silence, a sentence, an edit to the page, a page not shown at all. */
  const INTENSITY: Readonly<Record<string, number>> = {
    silent: 0,
    inform: 1,
    sanitize: 2,
    block: 3,
  }

  /** Weakest first, so "the step below" is literally the previous element. */
  const RUNGS: Confidence[] = ['low', 'medium', 'high', 'certain']

  const anyEvidence = fc.array(
    fc.constantFrom(...STAGES.map((stage) => evidence(stage))),
    { minLength: 1, maxLength: 6 },
  )

  it('answers with one of the four rungs and nothing else', () => {
    // `Action` has six members; two of them belong to other deciders. A ladder that
    // started returning `gate` would be silently mishandled by every caller that
    // switches on these four.
    fc.assert(
      fc.property(fc.constantFrom(...RUNGS), anyEvidence, (confidence, ev) => {
        return INTENSITY[decideAction({ confidence, evidence: ev })] !== undefined
      }),
    )
  })

  it('never weakens when confidence rises', () => {
    fc.assert(
      fc.property(anyEvidence, fc.integer({ min: 0, max: RUNGS.length - 2 }), (ev, i) => {
        const lower = decideAction({ confidence: RUNGS[i] as Confidence, evidence: ev })
        const higher = decideAction({ confidence: RUNGS[i + 1] as Confidence, evidence: ev })
        return (INTENSITY[higher] as number) >= (INTENSITY[lower] as number)
      }),
    )
  })

  it('never weakens when evidence anyone can check is added', () => {
    // The model-alone rule caps the answer; adding a deterministic stage may lift that
    // cap and must never lower it.
    fc.assert(
      fc.property(
        fc.constantFrom(...RUNGS),
        fc.array(fc.constant(evidence('model')), { minLength: 1, maxLength: 4 }),
        fc.constantFrom<Stage>('diff', 'rules', 'feed', 'inventory', 'corpus'),
        (confidence, modelOnly, checkable) => {
          const before = decideAction({ confidence, evidence: modelOnly })
          const after = decideAction({ confidence, evidence: [...modelOnly, evidence(checkable)] })
          return (INTENSITY[after] as number) >= (INTENSITY[before] as number)
        },
      ),
    )
  })

  it('is testing a real ladder, not a flat one', () => {
    // Without this, all three properties above hold trivially for a policy that answers
    // `silent` to everything.
    const answers = new Set(
      RUNGS.map((confidence) => decideAction({ confidence, evidence: [evidence('rules')] })),
    )
    expect(answers.size, 'every rung gives the same answer — the ladder is flat').toBe(4)
  })
})

describe('Verdict serialisation', () => {
  it('survives a JSON round trip unchanged', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CATEGORIES),
        fc.constantFrom(...STAGES),
        fc.string({ maxLength: 200 }),
        (category, stage, snippet) => {
          const verdict: Verdict = {
            id: 'v-1',
            subject: { kind: 'page', ref: 'https://example.test/path' },
            category,
            severity: 'major',
            confidence: 'high',
            evidence: [{ kind: 'hidden-text', stage, snippet, detail: { nodeCount: 3 } }],
            action: 'warn',
            sources: [{ name: `stage:${stage}`, version: '1', updatedAt: '2026-08-04T00:00:00Z' }],
            createdAt: '2026-08-04T00:00:00Z',
          }
          const roundTripped = JSON.parse(JSON.stringify(verdict)) as Verdict
          return JSON.stringify(roundTripped) === JSON.stringify(verdict)
        },
      ),
    )
  })
})
