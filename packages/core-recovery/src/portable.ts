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
  /**
   * The remaining steps in the order they must be read, numbered from one.
   *
   * **The order is the product.** Numbering runs across both groups rather than per
   * group, because renumbering inside "here" and "elsewhere" would lose which step
   * matters most.
   */
  readonly ordered: readonly { readonly index: number; readonly step: RecoveryStep }[]
  /** Steps that remain and cannot be done in this browser. */
  readonly elsewhere: readonly RecoveryStep[]
  /** Steps that remain and can. Listed too, so nothing is silently dropped. */
  readonly here: readonly RecoveryStep[]
}

export function toPortable(checklist: Checklist): PortableChecklist {
  const remaining = checklist.steps.filter((step) => !checklist.done.includes(step.id))
  const elsewhere = remaining.filter((step) => step.elsewhere)
  const here = remaining.filter((step) => !step.elsewhere)

  /**
   * Structure, not prose. The text is assembled by the surface, which has the
   * catalogue; this decides what remains and in what order, which is the part that is
   * a product decision rather than a translation (B-75).
   */
  return {
    ordered: remaining.map((step, at) => ({ index: at + 1, step })),
    elsewhere,
    here,
  }
}
