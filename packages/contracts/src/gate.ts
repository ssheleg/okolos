/**
 * The vocabulary of the action gate.
 *
 * It lives in contracts rather than in the gate itself because three layers
 * speak it: the content script that holds an action, the background that
 * journals the outcome, and the popup that shows the user what was held.
 */

export type ActionKind =
  | 'form-submit'
  | 'navigation'
  | 'download'
  | 'clipboard-write'
  | 'credential-fill'
  | 'unknown'

export interface AgentAction {
  readonly id: string
  readonly kind: ActionKind
  /** One sentence naming what is about to happen. Shown to the user verbatim. */
  readonly description: string
  /** A safe target — origin and path, or a field label. Never a query string. */
  readonly target?: string
  /** True only when the browser vouched for a real human gesture. */
  readonly humanGesture: boolean
}

export interface UnresolvedFinding {
  readonly id: string
  readonly summary: string
}

export type GateChoice = 'block' | 'allow-once'

export type GateOutcome = 'ungated' | 'blocked' | 'allowed-once'

export type GateReason =
  /** ungated */
  | 'no-finding'
  | 'human-gesture'
  /** blocked */
  | 'unidentified'
  | 'user-blocked'
  | 'timeout'
  | 'unavailable'
  /** allowed */
  | 'user-allowed'

export interface GateDecision {
  readonly actionId: string
  readonly outcome: GateOutcome
  readonly reason: GateReason
  readonly findingIds: readonly string[]
  /** A plain sentence, for the journal and for the user. Never empty. */
  readonly explain: string
}
