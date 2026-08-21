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
  /**
   * True when the browser reports it is being driven by automation.
   *
   * `humanGesture` alone does not mean a person. Measured on 2026-08-08: page
   * script calling `el.click()` produces `isTrusted: false`, but automation
   * input through the devtools protocol produces `isTrusted: true` — and that
   * is how browser agents act. Without this fact the gate greeted every one of
   * them as the user.
   *
   * It is not proof and does not pretend to be: an agent driving through an
   * extension is not WebDriver, and anyone who controls the browser's launch
   * can clear the flag. It closes the default configuration, which is the one
   * almost every agent runs in.
   *
   * Absent means "not driven" — the ordinary browser, where a trusted click is
   * a person and gating it would break the page.
   */
  readonly automated?: boolean
}

export interface UnresolvedFinding {
  readonly id: string
  readonly summary: string
}

/**
 * What came back from the surface — including the case where there was no surface.
 *
 * `already-asking` is not a thing a person can click: it is the answer when a gate
 * about another action is already on screen, and the second one was refused rather
 * than stacked on top of it. It travels as a choice because only the layer that owns
 * the surface knows a question was standing, and `resolveGate` must not translate it
 * into `user-blocked` — that would record a refusal by a reader who saw nothing.
 */
export type GateChoice = 'block' | 'allow-once' | 'already-asking'

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
  /**
   * A question about another action was already on screen.
   *
   * A gate asks about **one** action, and a second one arriving while it stands cannot be
   * answered by it: the panel names the first action, and a decision taken there would be
   * applied to something the reader never saw. Until 2026-08-21 the second attempt mounted a
   * second panel over the first — two questions in identical coordinates, the shape B-69
   * recorded for banners (B-123).
   *
   * Its own code rather than `unavailable`, because the journal is queried by kind and these
   * are different events with different remedies: one is "the surface would not open", this is
   * "you were already being asked".
   */
  | 'already-asking'
  /** allowed */
  | 'user-allowed'

export interface GateDecision {
  readonly actionId: string
  readonly outcome: GateOutcome
  readonly reason: GateReason
  readonly findingIds: readonly string[]
  /**
   * What the action was, for the sentence somebody writes about this decision.
   *
   * It used to be `explain: string` — a finished English sentence from a package with
   * zero dependencies, journalled and exported for a reader whose interface is Russian
   * (B-75). `reason` was already a code and the sentence merely restated it, so the
   * sentence is gone and the words are written where the catalogue is:
   * `handleGateDecision` in the background composes them from `reason` and this.
   */
  readonly describes: string
  /**
   * Why the confirmation could not be shown, when that is what happened.
   *
   * The one thing `reason` cannot carry: a browser's message about a surface that
   * failed to open. It is the platform's own text and stays as it is — quoting it is
   * honest, translating it invents a message no browser sent.
   */
  readonly detail?: string
}
