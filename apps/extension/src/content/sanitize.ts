import type { SanitisationPlan } from '@okolos/core-sanitizer'

/**
 * Carrying out a sanitisation plan, reversibly.
 *
 * Editing a page someone is reading is the most intrusive thing this product
 * does, so two rules shape everything here.
 *
 * The element stays. Only its contents are emptied. Removing the node outright
 * is tempting and wrong: pages keep references to their own elements, and a
 * missing node breaks scripts that had nothing to do with the injection.
 *
 * The original is kept, not remembered. A cloned fragment goes into a private
 * map, so "restore" puts back the exact markup rather than an approximation of
 * it — including nested elements the injection happened to contain.
 *
 * Both rules are about the second pass more than the first. The content script calls
 * `apply(planSanitisation(verdicts))` with verdicts from the previous scan of the
 * previous DOM, so on a page that rebuilds itself the ordinary case is a plan whose
 * locator now names a node this class has never seen. That is why the hold is keyed by
 * the element and not by the locator: the locator is a question about the page and its
 * answer changes, while the node whose contents we are holding does not.
 */

const MARKER = 'data-okolos-neutralised'

/** What a restore managed, and what the page took out of its hands. */
export interface RestoreResult {
  /** Put back where it came from. */
  readonly restored: number
  /** The element left the document while it was held. */
  readonly gone: number
  /** The page wrote into the element, so it is no longer ours to fill. */
  readonly changed: number
}

interface Held {
  readonly element: Element
  readonly contents: DocumentFragment
}

export class Sanitiser {
  /**
   * Keyed by the element, not by the locator that found it.
   *
   * Keyed by locator, a second pass over a rebuilt page emptied the node the locator
   * names *now* while holding the contents of the node it named *then* — the page's
   * own content destroyed with nothing anywhere able to put it back, and `restore`
   * reporting `gone`, which reads as the page having taken it out of our hands.
   */
  readonly #held = new Map<Element, Held>()

  constructor(private readonly doc: Document) {}

  /** Returns how many nodes were actually neutralised, not how many were asked for. */
  apply(plan: SanitisationPlan): number {
    let applied = 0

    for (const target of plan.targets) {
      const element = this.#find(target.locator)
      if (!element) continue

      if (this.#held.has(element)) {
        // This exact node, emptied by us already, and the plan still names it.
        if (element.firstChild !== null) {
          /**
           * The page has written into a node we emptied. Emptying it again would
           * discard content we never captured — and it would leave the node looking
           * like ours, so `restore` would append the held original beside nothing and
           * **put the injection back on the page** reporting success. That refusal
           * lives in `restore`, and clearing the node here is precisely what walks
           * around it. So: not touched, and not counted as neutralised.
           */
          continue
        }
        // Still empty, so still neutralised — by us, right now, which is what the
        // count means. The marker is re-asserted in case the page stripped it.
        element.setAttribute(MARKER, target.verdictId)
        applied += 1
        continue
      }

      // A node we have not held before — including the node the page put where a
      // held one used to be. Capture, then empty. Never the other way round, and
      // never one without the other.
      const contents = this.doc.createDocumentFragment()
      while (element.firstChild) contents.append(element.firstChild)
      this.#held.set(element, { element, contents })

      element.setAttribute(MARKER, target.verdictId)
      applied += 1
    }

    return applied
  }

  /**
   * Puts back what is still there to put back, and says what was not.
   *
   * Both refusals are the page moving underneath. `append` on a detached
   * element succeeds, so a node the page had removed used to count as
   * restored — a restore nobody can see. And a node the page has since written
   * into is no longer ours to fill: appending spliced the hidden instruction
   * in beside the page's new content and produced a document neither party
   * wrote, with the injection back in it.
   */
  restore(): RestoreResult {
    let restored = 0
    let gone = 0
    let changed = 0

    const finished: Element[] = []

    for (const [key, held] of this.#held) {
      try {
        if (!held.element.isConnected) {
          gone += 1
          finished.push(key)
          continue
        }
        if (held.element.firstChild !== null) {
          // The marker stays: this node is not back to normal, and saying it is
          // would be the same lie one level down. The hold stays too — see below.
          changed += 1
          continue
        }
        held.element.append(held.contents)
        held.element.removeAttribute(MARKER)
        restored += 1
        finished.push(key)
      } catch {
        // Throwing inside someone's page is never acceptable, whatever the
        // reason. Nothing further can be attempted on this one either.
        gone += 1
        finished.push(key)
      }
    }

    /**
     * Only what is finished with is dropped, and a refusal is not finished with.
     *
     * The map used to be cleared whatever the outcome, so a second press of
     * "Restore" answered `{0,0,0}` — and the caller reads `gone + changed === 0` as
     * done and closes the panel. The first press said honestly that it had refused;
     * the second retracted that and looked like success. The refusal is a standing
     * fact about the page: while the page's own content sits in that node, every
     * press must say the same thing.
     */
    for (const key of finished) this.#held.delete(key)
    return { restored, gone, changed }
  }

  /**
   * The one element the locator names, or nothing.
   *
   * `querySelector` returns the *first* match, and for a while the locators it was
   * given were not unique: a truncated tag-only path like `html > body > div > p`
   * matched the first paragraph on the page, so an injection in the seventh one had
   * an innocent paragraph emptied in its place, was left where it was, and the wrong
   * element carried the "neutralised" marker.
   *
   * The collector produces unique locators now. This refuses an ambiguous one anyway,
   * because the two guards fail differently: a locator that stops being unique — a
   * page that mutated between the scan and the edit, a collector change — should cost
   * an edit that did not happen, which the banner reports honestly, rather than an
   * edit to whichever element came first.
   */
  #find(locator: string): Element | null {
    try {
      const matches = this.doc.querySelectorAll(locator)
      if (matches.length !== 1) return null
      return matches[0] ?? null
    } catch {
      // Locators come from a collector walking a hostile page; an unparseable
      // one is a fact about the page, not a reason to stop.
      return null
    }
  }
}
