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

  /** Returns how many nodes were put back. */
  restore(): number {
    let restored = 0

    for (const [, held] of this.#held) {
      try {
        held.element.append(held.contents)
        held.element.removeAttribute(MARKER)
        restored += 1
      } catch {
        // The page removed the node while it was neutralised. Losing a restore
        // is acceptable; throwing inside someone's page is not.
      }
    }

    this.#held.clear()
    return restored
  }

  #find(locator: string): Element | null {
    try {
      return this.doc.querySelector(locator)
    } catch {
      // Locators come from a collector walking a hostile page; an unparseable
      // one is a fact about the page, not a reason to stop.
      return null
    }
  }
}
