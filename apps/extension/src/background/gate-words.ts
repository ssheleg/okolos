import type { GateDecision, GateReason } from '@okolos/contracts'
import { t } from '@okolos/i18n'

/**
 * The sentence a held action gets, written where a locale exists.
 *
 * `core-gate` used to hand over a finished English sentence beside the `reason` code
 * that said the same thing (B-75). That sentence went into the journal, and
 * `exportAll` dumps the journal verbatim into the file the user downloads — so it was
 * English copy on a surface a person reads, in a product whose audience reads Russian.
 * The code travels now; the words are here.
 *
 * Its own module rather than a closure in the worker, for the reason the pacer and the
 * frame reporter are: `background/index.ts` registers listeners at import, so nothing
 * in it can be called from a test — and a table nobody can call is a table nobody has
 * checked. Seven reasons, seven messages, and a test that walks the union.
 */

/**
 * A literal table, deliberately.
 *
 * `pnpm i18n:sweep`'s locale gate reads calls with a quoted key and `const NAME_KEY:
 * Record<…>` maps; a key computed from the code (`` t(`gateReason${…}`) ``) would make
 * all seven live messages look dead and invite their deletion.
 *
 * The first draft of this paragraph spelled the call out with a quoted key inside it,
 * and the gate read the comment as a use of a message named after the placeholder — the
 * third time a gate has been tripped by prose about itself.
 */
export const GATE_REASON_KEY: Record<GateReason, string> = {
  'no-finding': 'gateReasonNoFinding',
  'human-gesture': 'gateReasonHumanGesture',
  unidentified: 'gateReasonUnidentified',
  unavailable: 'gateReasonUnavailable',
  timeout: 'gateReasonTimeout',
  'user-allowed': 'gateReasonUserAllowed',
  'user-blocked': 'gateReasonUserBlocked',
}

/**
 * The key and its arguments — not the finished sentence, deliberately.
 *
 * The journal is read long after it is written, and `summarise` in the popup resolves
 * `explainKey` **at read time** so the reader's language decides. A sentence resolved
 * here and stored would freeze the language in force when the action was held: switch
 * the browser to English next month and every old gate line stays Russian, looking
 * like a translation that failed rather than a record that was honest.
 *
 * Three of the seven name the action. `unavailable` carries the browser's own words
 * about a surface that would not open instead — the one fact the code cannot hold, and
 * quoting it is honest where inventing a translation of it is not. The other three are
 * about the page, and take no argument.
 */
export function gateExplain(decision: GateDecision): {
  readonly explainKey: string
  readonly explainArgs: readonly string[]
} {
  const explainKey = GATE_REASON_KEY[decision.reason]
  if (decision.reason === 'unavailable') return { explainKey, explainArgs: [decision.detail ?? ''] }
  return { explainKey, explainArgs: [decision.describes] }
}

/** The same sentence a reader will see, for the surfaces that show one immediately. */
export function gateSentence(decision: GateDecision): string {
  const { explainKey, explainArgs } = gateExplain(decision)
  return t(explainKey, ...explainArgs)
}
