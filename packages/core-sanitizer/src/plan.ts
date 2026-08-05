import type { Verdict } from '@okolos/contracts'

/**
 * Deciding what to neutralise — and nothing else.
 *
 * The plan is pure and says only which nodes an executor should touch. Editing
 * someone's page is the most intrusive thing this product does, so the decision
 * is kept in one small, testable place, away from the DOM code that carries it
 * out.
 *
 * Only `sanitize` verdicts qualify. The ladder reserves that action for
 * evidence a person could check for themselves; a classifier's score may raise
 * suspicion and never rewrite a page.
 */

export interface SanitisationTarget {
  readonly locator: string
  readonly verdictId: string
}

export interface SanitisationPlan {
  readonly targets: readonly SanitisationTarget[]
}

export function planSanitisation(verdicts: readonly Verdict[]): SanitisationPlan {
  const seen = new Set<string>()
  const targets: SanitisationTarget[] = []

  for (const verdict of verdicts) {
    if (verdict.action !== 'sanitize') continue
    for (const evidence of verdict.evidence) {
      const locator = evidence.locator
      if (!locator || seen.has(locator)) continue
      seen.add(locator)
      targets.push({ locator, verdictId: verdict.id })
    }
  }

  return { targets }
}
