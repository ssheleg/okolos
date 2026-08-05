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

export interface RecoveryStep {
  readonly id: string
  readonly title: string
  readonly why: string
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
  title: 'Disconnect this device from the network',
  why: 'Anything already running loses its connection to whoever placed it, which stops the theft while you work through the rest.',
  elsewhere: true,
}

const PASSWORDS_FROM_ELSEWHERE: RecoveryStep = {
  id: 'passwords-elsewhere',
  title: 'Change your email password from a different device',
  why: 'Email is the key to every other account. Changing it from the affected device would hand the new password over too.',
  elsewhere: true,
}

const SESSIONS: RecoveryStep = {
  id: 'sessions',
  title: 'Sign out of all sessions on your important accounts',
  why: 'A stolen session cookie keeps working after a password change until the session itself is ended.',
  elsewhere: false,
}

const TWO_FACTOR: RecoveryStep = {
  id: 'two-factor',
  title: 'Check the two-factor settings on your main accounts',
  why: 'Adding a second factor of their own is how an intruder keeps access after you have locked them out.',
  elsewhere: false,
}

const SCAN: RecoveryStep = {
  id: 'scan',
  title: 'Run a full scan with your system’s own security tool',
  why: 'It looks for what the command installed. Do this after the accounts are safe, not before — the accounts are what an attacker uses first.',
  elsewhere: true,
}

const BANK: RecoveryStep = {
  id: 'bank',
  title: 'Call your bank on the number printed on your card',
  why: 'Not the number you were given. If money moved, the earlier they know, the more of it can be stopped.',
  elsewhere: true,
}

const REMOTE_ACCESS: RecoveryStep = {
  id: 'remote-access',
  title: 'Remove any remote-access software they had you install',
  why: 'That software is how they get back in, and it keeps working long after the call ends.',
  elsewhere: true,
}

const REVIEW_PASSWORD: RecoveryStep = {
  id: 'change-password',
  title: 'Change the password you typed, and anywhere else you used it',
  why: 'A password entered on a fake site is tried immediately on every service that shares it.',
  elsewhere: false,
}

const WATCH: RecoveryStep = {
  id: 'watch',
  title: 'Watch the account for a week',
  why: 'Access that survives everything above shows up as a login you do not recognise.',
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
  const known = kind in INCIDENTS
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
