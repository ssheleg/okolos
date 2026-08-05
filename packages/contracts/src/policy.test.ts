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
