/**
 * What to do now, in the order that limits the damage.
 *
 * The ordering is the whole product here. Someone who has just pasted a command
 * into a run box does not need a list of everything that could be wrong; they
 * need the one action that stops the bleeding, then the next. So steps are
 * ordered by what an attacker can still do if the step is skipped, not by how
 * easy each one is.
 *
 * Every step says why. A checklist of instructions with no reasons is followed
 * once, badly, and abandoned at the first step that is inconvenient.
 */

export type IncidentKind = 'pasted-command' | 'entered-password' | 'called-number' | 'not-sure'

/**
 * A step is an **identity and a fact**, not a sentence.
 *
 * It carried `title` and `why` until 2026-08-20, in English, in a package with zero
 * dependencies — so eighteen sentences of the most important screen this product has
 * shipped to a ru-default interface, and adding `@okolos/i18n` here would have spent
 * `core-*`'s only architectural property on a string table (B-75).
 *
 * The id is the join: `packages/ui/src/recovery/recovery.ts` maps it to a catalogue key
 * through a `*_KEY` table, which is the shape the locale gate reads — a computed key
 * would make every one of these eighteen messages look dead to it.
 */
export interface RecoveryStep {
  readonly id: string
  /** True when this cannot be done in this browser — another device, or offline. */
  readonly elsewhere: boolean
}

export interface StepProgress {
  readonly stepId: string
  readonly doneAt: string
}

export interface Checklist {
  readonly kind: IncidentKind
  readonly steps: readonly RecoveryStep[]
  readonly done: readonly string[]
  readonly remaining: number
  /** True when the specific playbook was unavailable and the generic one is shown. */
  readonly generic: boolean
}

const DISCONNECT: RecoveryStep = {
  id: 'disconnect',
  elsewhere: true,
}

const PASSWORDS_FROM_ELSEWHERE: RecoveryStep = {
  id: 'passwords-elsewhere',
  elsewhere: true,
}

const SESSIONS: RecoveryStep = {
  id: 'sessions',
  elsewhere: false,
}

const TWO_FACTOR: RecoveryStep = {
  id: 'two-factor',
  elsewhere: false,
}

const SCAN: RecoveryStep = {
  id: 'scan',
  elsewhere: true,
}

const BANK: RecoveryStep = {
  id: 'bank',
  elsewhere: true,
}

const REMOTE_ACCESS: RecoveryStep = {
  id: 'remote-access',
  elsewhere: true,
}

const REVIEW_PASSWORD: RecoveryStep = {
  id: 'change-password',
  elsewhere: false,
}

const WATCH: RecoveryStep = {
  id: 'watch',
  elsewhere: false,
}

export const INCIDENTS: Readonly<Record<IncidentKind, readonly RecoveryStep[]>> = {
  'pasted-command': [DISCONNECT, PASSWORDS_FROM_ELSEWHERE, SESSIONS, TWO_FACTOR, SCAN, WATCH],
  'entered-password': [REVIEW_PASSWORD, SESSIONS, TWO_FACTOR, WATCH],
  'called-number': [REMOTE_ACCESS, DISCONNECT, PASSWORDS_FROM_ELSEWHERE, BANK, SCAN, WATCH],
  'not-sure': [PASSWORDS_FROM_ELSEWHERE, SESSIONS, TWO_FACTOR, SCAN, WATCH],
}

export function buildChecklist(
  kind: string,
  progress: readonly StepProgress[] = [],
): Checklist {
  /**
   * `Object.hasOwn`, not `in`: the `in` operator walks the prototype chain, so
   * `'constructor' in INCIDENTS` was **true** and the lookup returned `Object`.
   * `steps.some(...)` on a function threw, and `#recovery=constructor` rendered a
   * blank options page — on the one screen a person reaches while something is
   * already going wrong. Measured 2026-08-20.
   */
  const known = Object.hasOwn(INCIDENTS, kind)
  const resolved: IncidentKind = known ? (kind as IncidentKind) : 'not-sure'
  const steps = INCIDENTS[resolved]
  const done = progress.map((entry) => entry.stepId).filter((id) => steps.some((step) => step.id === id))

  return {
    kind: resolved,
    steps,
    done: [...new Set(done)],
    remaining: steps.length - new Set(done).size,
    // An unknown incident gets the broadest safe list, and is told that is what
    // it is getting — a checklist that quietly answers a different question is
    // worse than one that admits the mismatch.
    generic: !known,
  }
}
