/**
 * What went wrong with an action, said on the page instead of in a browser modal.
 *
 * Two writes on this page reported failure with the browser's own dialog: the generic
 * `act` wrapper, which every action on every area goes through, and the extensions area's
 * disable. A modal is the wrong answer here for four reasons, and the last one is the one
 * that matters:
 *
 *   - it blocks the page and everything on it until dismissed;
 *   - its text cannot be styled, so a sentence written through the brand pack arrives in a
 *     system font inside a system box;
 *   - `axe` never sees it, so the accessibility sweep says nothing about it;
 *   - it reads as *the browser* failing rather than as this product answering. Every other
 *     failure in this product is a slot on the screen — SCN-023 and SCN-024 both say so in
 *     the same words: "one answer on the screen, whatever the clicking", replaced rather
 *     than appended.
 *
 * So this is that slot, and it is one slot: a second failure replaces the first rather than
 * stacking under it, which is the defect those two scenarios record from the wipe screen.
 */

/** The role the stylesheet and the tests both address. */
export const FAILURE_ROLE = 'page-failure'

/**
 * Puts the message at the top of the page, or takes the slot away when there is none.
 *
 * Returns the element so a caller can assert on it; `null` when the slot was cleared.
 */
export function showFailure(doc: Document, root: Element, message: string | null): Element | null {
  const existing = root.querySelector(`[data-role='${FAILURE_ROLE}']`)
  existing?.remove()
  if (message === null) return null

  const slot = doc.createElement('p')
  slot.setAttribute('data-role', FAILURE_ROLE)
  /**
   * Announced, because the reader may be looking at the control they pressed rather than at
   * the top of the page. `assertive` rather than `polite`: the action they asked for did not
   * happen, and hearing that after the next sentence is hearing it too late.
   */
  slot.setAttribute('role', 'alert')
  slot.textContent = message
  root.prepend(slot)
  return slot
}
