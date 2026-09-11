/**
 * Assembling a verdict from the checks that actually ran.
 *
 * The shape is deliberately the same one `core-download` reached for a
 * download: a verdict is not a score, it is a list of what fired plus a list of
 * what could not be looked at. A mail verdict has more of the second kind than
 * anything else in this product — an unauthenticated sender, an attachment the
 * parser refused, a blocklist past its age, a reviewer that is off — so folding
 * them into silence would make this the most confidently wrong surface here.
 */

export type Severity = 'critical' | 'major' | 'minor' | 'none'

const ORDER: Readonly<Record<Severity, number>> = {
  none: 0,
  minor: 1,
  major: 2,
  critical: 3,
}

export function worstOf(severities: readonly Severity[]): Severity {
  let worst: Severity = 'none'
  for (const s of severities) if (ORDER[s] > ORDER[worst]) worst = s
  return worst
}

/**
 * Every check this product can perform on a message, named once.
 *
 * The list is the contract behind "a check nobody reported did not run". A
 * registry that is built from what the caller happened to return can never
 * notice an absence, and an absence is the failure mode this whole file exists
 * to make visible.
 *
 * **The sender is three entries, not one, and the split is the point.** A first
 * version had a single `sender`, and it could not tell the truth about the
 * ordinary case: a message with no `Authentication-Results` header at all still
 * has a display name to compare against its domain. Reporting `sender: not
 * checked` would hide that the lookalike check ran; reporting `sender: checked`
 * would hide that nobody verified the message was really sent by that domain.
 * A granularity that forces one of two false answers is the wrong granularity.
 */
export const CHECKS = [
  'senderAuth',
  'senderIdentity',
  'replyPath',
  'links',
  'hidden',
  'attachments',
] as const
export type CheckId = (typeof CHECKS)[number]

/** A fact a person can check for themselves, shown beside the signal. */
export interface MailFact {
  readonly label: string
  readonly value: string
}

/**
 * `code` is a catalogue key, never a finished sentence.
 *
 * B-115: a reason written as a sentence freezes in the language of the day it
 * was recorded, and a record read a year later is read in whatever language the
 * interface speaks then. The words belong to the surface.
 */
export interface MailSignal {
  readonly check: CheckId
  readonly severity: Severity
  readonly code: string
  readonly facts: readonly MailFact[]
}

export type CheckOutcome =
  | { readonly ran: true; readonly signals: readonly MailSignal[] }
  | { readonly ran: false; readonly why: string }

export interface NotRun {
  readonly check: CheckId
  readonly why: string
}

export type ReviewerHome = 'local' | 'cloud' | 'none'

export interface Review {
  readonly reviewer: string
  readonly ran: ReviewerHome
  readonly severity: Severity
  readonly summary: string
}

export interface MailVerdict {
  readonly severity: Severity
  readonly signals: readonly MailSignal[]
  readonly notRun: readonly NotRun[]
  readonly truncated: boolean
  readonly review: Review | null
}

export interface MessageFacts {
  readonly truncated: boolean
}

export function assembleVerdict(
  outcomes: ReadonlyMap<CheckId, CheckOutcome>,
  facts: MessageFacts,
): MailVerdict {
  const signals: MailSignal[] = []
  const notRun: NotRun[] = []

  for (const check of CHECKS) {
    const outcome = outcomes.get(check)
    if (outcome === undefined) {
      // Silence from a check is not a pass. A caller that forgot to run one is
      // indistinguishable, from here, from one that ran it and found nothing —
      // so the registry decides, not the caller's map.
      notRun.push({ check, why: 'notReported' })
      continue
    }
    if (!outcome.ran) {
      notRun.push({ check, why: outcome.why })
      continue
    }
    signals.push(...outcome.signals)
  }

  return {
    severity: worstOf(signals.map((s) => s.severity)),
    signals,
    notRun,
    truncated: facts.truncated,
    review: null,
  }
}

/**
 * Folds a review in, and clamps it.
 *
 * [ADR-0004](../../../docs/adr/0004-verdict-never-outruns-checks.md) applied to
 * a stage that did not exist when it was written: the model explains, orders
 * and quiets, and it cannot manufacture a severity the deterministic checks did
 * not reach. Lowering is allowed and is most of its value — a signal that fired
 * on a legitimate message is noise, and noise is what trains a person to stop
 * reading.
 */
export function applyReview(verdict: MailVerdict, review: Review | null): MailVerdict {
  if (review === null) return { ...verdict, review: null }
  const clamped: Severity =
    ORDER[review.severity] > ORDER[verdict.severity] ? verdict.severity : review.severity
  return {
    ...verdict,
    severity: clamped,
    review: { ...review, severity: clamped },
  }
}
