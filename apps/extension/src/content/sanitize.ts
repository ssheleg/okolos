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
  readonly #held = new Map<string, Held>()

  constructor(private readonly doc: Document) {}

  /** Returns how many nodes were actually neutralised, not how many were asked for. */
  apply(plan: SanitisationPlan): number {
    let applied = 0

    for (const target of plan.targets) {
      const element = this.#find(target.locator)
      if (!element) continue

      // Already held: the page mutated and we re-ran. Keep the first capture,
      // or a second pass would record the emptied version as the original.
      if (!this.#held.has(target.locator)) {
        const contents = this.doc.createDocumentFragment()
        while (element.firstChild) contents.append(element.firstChild)
        this.#held.set(target.locator, { element, contents })
      } else {
        element.replaceChildren()
      }

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

    for (const [, held] of this.#held) {
      try {
        if (!held.element.isConnected) {
          gone += 1
          continue
        }
        if (held.element.firstChild !== null) {
          // The marker stays: this node is not back to normal, and saying it is
          // would be the same lie one level down.
          changed += 1
          continue
        }
        held.element.append(held.contents)
        held.element.removeAttribute(MARKER)
        restored += 1
      } catch {
        // Throwing inside someone's page is never acceptable, whatever the
        // reason.
        gone += 1
      }
    }

    this.#held.clear()
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
