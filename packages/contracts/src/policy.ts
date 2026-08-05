import type { Action, Confidence, Evidence, Stage } from './verdict.js'

/**
 * Stages whose output can be re-derived from the page itself. A human can
 * check any of them by looking; a model's answer cannot be checked that way,
 * which is why it does not get to act alone.
 */
const DETERMINISTIC: ReadonlySet<Stage> = new Set<Stage>([
  'diff',
  'rules',
  'feed',
  'inventory',
  'corpus',
])

export interface ActionInput {
  readonly confidence: Confidence
  readonly evidence: readonly Evidence[]
}

/**
 * The confidence ladder (spec §3).
 *
 * The classifier may raise suspicion but never acts on its own: a verdict
 * whose evidence is model-only is capped at `inform`, whatever confidence the
 * caller claims. Blocking a page on an unexplainable score is the failure mode
 * this product was built against, so it is a branch here rather than a
 * guideline in a document.
 */
export function decideAction(input: ActionInput): Action {
  const backedByEvidenceAnyoneCanCheck = input.evidence.some((e) => DETERMINISTIC.has(e.stage))

  if (!backedByEvidenceAnyoneCanCheck) {
    return input.confidence === 'low' ? 'silent' : 'inform'
  }

  switch (input.confidence) {
    case 'certain':
      return 'block'
    case 'high':
      return 'sanitize'
    case 'medium':
      return 'inform'
    case 'low':
      return 'silent'
  }
}
