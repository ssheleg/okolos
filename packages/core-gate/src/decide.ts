/**
 * Putting a human between a poisoned page and a sensitive action.
 *
 * An injection is only dangerous when something acts on it. This is the place
 * where acting is interrupted — and it is deliberately small and pure, because
 * everything here is a safety decision and safety decisions should be readable
 * in one sitting.
 *
 * Three rules run through it:
 *
 *   - The default is Block. Not answering, a gate that fails to open, an action
 *     nobody can name: all of them block. The only path to "allow" is a person
 *     choosing it.
 *   - "Once" means once. A decision is about one action, never about the page.
 *   - The gate stays out of the way otherwise. It opens only for an action no
 *     human initiated, on a page with a finding the user has not handled. A
 *     guard that interrupts everything gets uninstalled, and an uninstalled
 *     guard protects nobody.
 */

import type {
  AgentAction,
  GateChoice,
  GateDecision,
  GateOutcome,
  GateReason,
  UnresolvedFinding,
} from '@okolos/contracts'

export type {
  ActionKind,
  AgentAction,
  GateChoice,
  GateDecision,
  GateOutcome,
  GateReason,
  UnresolvedFinding,
} from '@okolos/contracts'

/** Module scope so its type is a `unique symbol` the race can be narrowed against. */
const TIMED_OUT = Symbol('gate-timeout')

export type GateAssessment =
  | { readonly ask: true; readonly action: AgentAction; readonly findings: readonly UnresolvedFinding[] }
  | { readonly ask: false; readonly decision: GateDecision }

/**
 * Decides whether this action needs a person — and settles it outright when it
 * does not. Pure: no clock, no DOM, no storage.
 */
export function assessAction(
  action: AgentAction,
  unresolved: readonly UnresolvedFinding[],
): GateAssessment {
  const findingIds = unresolved.map((finding) => finding.id)
  const settle = (outcome: GateOutcome, reason: GateReason, explain: string): GateAssessment => ({
    ask: false,
    decision: { actionId: action.id, outcome, reason, findingIds, explain },
  })

  if (unresolved.length === 0) {
    return settle(
      'ungated',
      'no-finding',
      'Nothing on this page is unresolved, so the action was not held.',
    )
  }

  if (action.humanGesture) {
    return settle(
      'ungated',
      'human-gesture',
      'You started this action yourself, so it was not held.',
    )
  }

  if (action.kind === 'unknown' || action.description.trim() === '') {
    // There is no honest question to put to the user here: a modal that cannot
    // say what it is about invites a reflexive "allow".
    return settle(
      'blocked',
      'unidentified',
      'Blocked: this page has an unresolved finding and we could not determine what kind of action was being attempted.',
    )
  }

  return { ask: true, action, findings: unresolved }
}

/**
 * Runs the gate to a decision.
 *
 * The caller owns both the asking and the clock: `ask` opens whatever surface
 * the platform has, and `expiry` is a promise that settles when the user has
 * had long enough. Keeping the timer outside makes this function reproducible
 * and keeps the browser out of a `core-` package.
 */
export async function resolveGate(
  assessment: GateAssessment,
  ask: () => Promise<GateChoice>,
  expiry: Promise<void>,
): Promise<GateDecision> {
  if (!assessment.ask) return assessment.decision

  const { action, findings } = assessment
  const findingIds = findings.map((finding) => finding.id)
  const decide = (outcome: GateOutcome, reason: GateReason, explain: string): GateDecision => ({
    actionId: action.id,
    outcome,
    reason,
    findingIds,
    explain,
  })

  let choice: GateChoice | typeof TIMED_OUT
  try {
    choice = await Promise.race([ask(), expiry.then((): typeof TIMED_OUT => TIMED_OUT)])
  } catch (cause) {
    // The surface could not be shown. A gate that fails open is not a gate.
    const detail = cause instanceof Error ? cause.message : String(cause)
    return decide(
      'blocked',
      'unavailable',
      `Blocked: the action was held but the confirmation could not be shown (${detail}).`,
    )
  }

  if (choice === TIMED_OUT) {
    return decide(
      'blocked',
      'timeout',
      `Blocked: "${action.description}" was held for a decision and none was given in time.`,
    )
  }

  return choice === 'allow-once'
    ? decide(
        'allowed-once',
        'user-allowed',
        `Allowed once: you let "${action.description}" proceed from a page with an unresolved finding.`,
      )
    : decide('blocked', 'user-blocked', `Blocked: you stopped "${action.description}".`)
}
