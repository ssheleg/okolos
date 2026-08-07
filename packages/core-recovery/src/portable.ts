import type { Checklist, RecoveryStep } from './checklist.js'

/**
 * The part of a recovery you have to carry out of this browser.
 *
 * Five of the nine steps in the worst checklist cannot be done here — change
 * your email password from a different device, disconnect this one, run a scan,
 * phone the bank on the number printed on your card. Discovering that halfway
 * through, with no way to take the list with you, is where people stop.
 *
 * What is deliberately *not* built here is device sync. A recovery record says
 * which incident happened to a particular person; shipping it to a server so it
 * can appear on their phone would trade the product's one real promise for a
 * convenience the user can get by pasting text into a note. So the transport is
 * theirs: the steps become text, and text goes wherever they already send
 * things.
 */

export interface PortableChecklist {
  readonly text: string
  /** Steps that remain and cannot be done in this browser. */
  readonly elsewhere: readonly RecoveryStep[]
  /** Steps that remain and can. Listed too, so nothing is silently dropped. */
  readonly here: readonly RecoveryStep[]
}

const TITLES: Record<Checklist['kind'], string> = {
  'pasted-command': 'after running a pasted command',
  'entered-password': 'after entering a password on a fake page',
  'called-number': 'after calling a number from a warning',
  'not-sure': 'when you are not sure what happened',
}

export function toPortable(checklist: Checklist): PortableChecklist {
  const remaining = checklist.steps.filter((step) => !checklist.done.includes(step.id))
  const elsewhere = remaining.filter((step) => step.elsewhere)
  const here = remaining.filter((step) => !step.elsewhere)

  const lines: string[] = [
    `What to do ${TITLES[checklist.kind]}`,
    '',
    remaining.length === 0
      ? 'Every step is done. Nothing left to carry.'
      : `${remaining.length} step${remaining.length === 1 ? '' : 's'} left, most important first.`,
  ]

  // Numbered from one across both groups: the order is the product, and
  // renumbering per group would lose it.
  let index = 0
  for (const step of remaining) {
    index += 1
    lines.push('', `${index}. ${step.title}${step.elsewhere ? '  (not in this browser)' : ''}`)
    // The reason travels with the step. A list of bare instructions is followed
    // once, badly, and abandoned at the first inconvenient one.
    lines.push(`   Why: ${step.why}`)
  }

  return { text: lines.join('\n'), elsewhere, here }
}
