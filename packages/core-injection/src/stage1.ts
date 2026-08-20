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
 * Signals worth a verdict. Each is checkable by a person looking at the same
 * text, which is the property that separates this stage from the classifier:
 * the user can be shown exactly why, and disagree.
 *
 * They are not equally strong, and until 2026-08-20 they were treated as if
 * they were — any one of them produced `high` confidence, which the ladder
 * turns into `sanitize`, which edits the page. So a screen-reader label, a
 * specification row and a family emoji each got a paragraph of somebody's page
 * emptied.
 *
 * `STANDS_ALONE` holds the shapes with no innocent reading in hidden text:
 * cancelling prior instructions, claiming to be the system layer, asking for
 * secrecy from the user, addressing a condition only a machine can meet, or
 * assigning the reader a model's role. Everything else corroborates: a tool
 * noun, a credential, an address, an invisible character. One of those is a
 * banner; two is an edit.
 *
 * The split is the whole reason a false positive now costs a sentence the user
 * can dismiss rather than a page they have to reload.
 */
const STANDS_ALONE: ReadonlySet<SignalName> = new Set<SignalName>([
  'override',
  'role-assignment',
  'secrecy',
  'conditional-identity',
  'system-prompt',
])

const CORROBORATING: ReadonlySet<SignalName> = new Set<SignalName>([
  'vocative',
  'tool-invocation',
  'sensitive-target',
  'char-anomaly',
])

const DECISIVE: ReadonlySet<SignalName> = new Set<SignalName>([
  ...STANDS_ALONE,
  ...CORROBORATING,
])

/**
 * Everything the union allows must sit in exactly one tier.
 *
 * A signal added to `SignalName` and forgotten here would be silently
 * undecisive — it would produce no verdict at all, which is the failure mode
 * this project has a standing instruction about: absence of data reading as a
 * pass. `packages/core-injection/src/stage1.test.ts` asserts the partition.
 */
export const TIERS = { standsAlone: STANDS_ALONE, corroborating: CORROBORATING } as const

/**
 * Turns collected candidates into verdicts. Pure: same input, same output,
 * no DOM, no clock, no network — which is what makes a corpus run mean
 * something.
 */
export function detectHidden(page: PageCandidates, ctx: DetectContext): Verdict[] {
  const verdicts: Verdict[] = []

  for (const candidate of page.candidates) {
    const report = analyse(candidate.text)
    const decisive = report.signals.filter((s) => DECISIVE.has(s))
    if (decisive.length === 0) continue

    /**
     * One corroborating signal names a suspicion; it does not license an edit.
     *
     * `medium` reaches `inform` on the ladder — a banner the user can read and
     * dismiss — while `high` reaches `sanitize`, which rewrites the page. The
     * difference is what a false positive costs.
     */
    const standsAlone =
      decisive.some((s) => STANDS_ALONE.has(s)) ||
      // Or a corroborating signal that matched in a form nothing innocent
      // produces: "use *your* browsing tool", a right-to-left override.
      report.strong.length > 0
    // i18n-exempt: not copy at all — the sweep's three-word anchor reads
    // `'high' as const` as a sentence. Counted as debt since B-51 and impossible to
    // pay: the class is B-76.
    const confidence = standsAlone || decisive.length >= 2 ? ('high' as const) : ('medium' as const)

    const evidence = toEvidence(
      candidate,
      decisive,
      report.normalised,
      page.truncated,
      report.anomalies,
    )

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
  anomalies: readonly string[],
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
      // What the characters were *doing*, not merely which ranges they fell in.
      // The collector's classes say a zero-width character is present; this says
      // whether it was splitting a word or holding an emoji together.
      anomalies: anomalies.join(','),
      // A verdict from a cut-short traversal says so, rather than implying it
      // looked at the whole page.
      partialScan,
    },
  }
}
