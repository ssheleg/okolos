/**
 * Carrying focus across a repaint — for whatever the user was on.
 *
 * The page repaints by replacing its children, and removing an element from the
 * document blurs it with no event to put it back. The first version of this
 * module restored focus to **one** node, the address field, and said so in its
 * own doc comment: that was where a typed address went, and the check clicked
 * afterwards read an empty string.
 *
 * Everything else on the page kept losing focus, silently, forever. Ticking a
 * recovery step, pressing "Готово" on a queue row, revoking a trusted site —
 * every one of them rebuilt its own button and returned a keyboard user to the
 * top of the document. Fourteen call sites, one restored node.
 *
 * The address field survives by identity, because it is *moved* into the new
 * tree rather than rebuilt. Nothing else can: a repaint makes new elements, so
 * "the same control" has to be described rather than held. The description is a
 * path of `[key, index]` steps from the region root down, where the key is the
 * element's `data-role` when it has one and its tag name when it does not, and
 * the index is its position among siblings sharing that key.
 *
 * That is deliberately positional, and the queue is why. Resolving the top item
 * removes it, and the row that takes its place is the one the user should now
 * be on — an identifier-based restore would hunt for a control that no longer
 * exists and drop focus to the document, which is the defect this module is for.
 */

/** Where focus was, described well enough to find it again in a new tree. */
export interface FocusMark {
  /** `[key, index]` from the region root down to the focused element. */
  readonly path: readonly (readonly [string, number])[]
  readonly start: number | null
  readonly end: number | null
}

function keyOf(el: Element): string {
  return el.getAttribute('data-role') ?? el.tagName.toLowerCase()
}

function indexOf(el: Element, key: string): number {
  const parent = el.parentElement
  if (parent === null) return 0
  let seen = 0
  for (const sibling of parent.children) {
    if (sibling === el) return seen
    if (keyOf(sibling) === key) seen += 1
  }
  return seen
}

/**
 * Describes the focused element, if it is inside `region` and worth restoring.
 *
 * Returns `null` when focus is elsewhere — on the document body, in another
 * frame, in the browser's own chrome. **Putting focus where the person did not
 * leave it is its own bug**, and a noisier one than losing it: it steals the
 * caret from whatever they moved on to.
 */
export function markFocus(region: Element, doc: Document): FocusMark | null {
  const active = doc.activeElement
  if (!(active instanceof HTMLElement)) return null
  if (active === doc.body || !region.contains(active) || active === region) return null

  const path: (readonly [string, number])[] = []
  let node: Element | null = active
  while (node !== null && node !== region) {
    const key = keyOf(node)
    path.unshift([key, indexOf(node, key)])
    node = node.parentElement
  }
  // Focus was inside something that is not under the region after all.
  if (node !== region) return null

  const field = active as HTMLInputElement
  const selectable = typeof field.selectionStart === 'number'
  return {
    path,
    start: selectable ? field.selectionStart : null,
    end: selectable ? field.selectionEnd : null,
  }
}

function walk(region: Element, path: FocusMark['path']): HTMLElement | null {
  let node: Element = region
  for (const [key, index] of path) {
    let seen = 0
    let found: Element | null = null
    for (const child of node.children) {
      if (keyOf(child) !== key) continue
      if (seen === index) {
        found = child
        break
      }
      seen += 1
    }
    // The control is gone — the row was resolved, the section changed shape.
    // Falling back to the nearest surviving ancestor would move focus somewhere
    // the user never was; leaving it alone is the honest answer.
    if (found === null) return null
    node = found
  }
  return node instanceof HTMLElement ? node : null
}

/** Puts focus, and the caret, back where `mark` says they were. */
export function applyFocus(region: Element, mark: FocusMark | null): void {
  if (mark === null) return
  const target = walk(region, mark.path)
  if (target === null) return

  target.focus()
  if (mark.start === null || mark.end === null) return
  try {
    ;(target as HTMLInputElement).setSelectionRange(mark.start, mark.end)
  } catch {
    // Not every input type carries a selection — `type=email` refuses in some
    // engines. Focus is the part that matters; the caret is the courtesy.
  }
}

/**
 * Runs `repaint`, and gives focus and selection back to whatever held them.
 *
 * `region` must be the element whose *children* are replaced, not one of them:
 * the paths are relative to it and it has to survive the repaint.
 */
export function keepingFocus(region: Element, doc: Document, repaint: () => void): void {
  const mark = markFocus(region, doc)
  repaint()
  applyFocus(region, mark)
}
