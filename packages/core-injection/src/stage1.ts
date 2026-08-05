import { decideAction } from '@okolos/contracts'
import type { Evidence, HiddenTextCandidate, PageCandidates, Verdict } from '@okolos/contracts'

import { analyse, type SignalName } from './signals.js'

const SNIPPET_LIMIT = 200

export interface DetectContext {
  /** ISO timestamp supplied by the caller — this module never reads a clock. */
  readonly now: string
  readonly newId: () => string
}

/**
 * Signals strong enough to act on their own. Each is checkable by a person
 * looking at the same text, which is the property that separates this stage
 * from the classifier: the user can be shown exactly why, and disagree.
 */
const DECISIVE: ReadonlySet<SignalName> = new Set<SignalName>([
  'override',
  'role-assignment',
  'vocative',
  'secrecy',
  'conditional-identity',
  'tool-invocation',
  'system-prompt',
  'sensitive-target',
  'char-anomaly',
])

/**
 * Turns collected candidates into verdicts. Pure: same input, same output,
 * no DOM, no clock, no network — which is what makes a corpus run mean
 * something.
 */
export function detectHidden(page: PageCandidates, ctx: DetectContext): Verdict[] {
  const verdicts: Verdict[] = []

  for (const candidate of page.candidates) {
    const report = analyse(candidate.text, candidate.charClasses)
    const decisive = report.signals.filter((s) => DECISIVE.has(s))
    if (decisive.length === 0) continue

    const evidence = toEvidence(candidate, decisive, report.normalised, page.truncated)
    const confidence = 'high' as const

    verdicts.push({
      id: ctx.newId(),
      subject: { kind: 'page', ref: page.url },
      category: 'injection',
      severity: 'major',
      confidence,
      evidence: [evidence],
      action: decideAction({ confidence, evidence: [evidence] }),
      sources: [{ name: 'stage:rules', version: '1', updatedAt: ctx.now }],
      createdAt: ctx.now,
    })
  }

  return verdicts
}

function toEvidence(
  candidate: HiddenTextCandidate,
  signals: readonly SignalName[],
  normalised: string,
  partialScan: boolean,
): Evidence {
  return {
    kind: 'hidden-text',
    stage: 'rules',
    locator: candidate.locator,
    // A sample, never the payload: enough for the user to recognise the text,
    // not enough to become a copy of the page in our storage.
    snippet: normalised.slice(0, SNIPPET_LIMIT),
    detail: {
      signals: signals.join(','),
      concealment: candidate.concealment.join(','),
      carrier: candidate.carrier,
      charClasses: candidate.charClasses.join(','),
      // A verdict from a cut-short traversal says so, rather than implying it
      // looked at the whole page.
      partialScan,
    },
  }
}
