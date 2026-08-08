/**
 * Carrying focus across a repaint.
 *
 * The options page repaints wholesale — `replaceChildren` — and the address
 * field is *moved* into the new tree rather than rebuilt, so its value, and
 * anything an IME had in progress, survive. Focus does not: removing an element
 * from the document blurs it, and there is no event to put it back.
 *
 * That is where a typed address went. Native typing has to land in a focused
 * editable element; with the field blurred mid-repaint the keystrokes went
 * nowhere, and the check clicked afterwards read an empty address. It looked
 * like a value vanishing from a live input, which is why it survived four
 * days and four instruments: every instrument added a round trip that let the
 * repaint finish before the typing started, and the failure disappeared.
 *
 * The caret is restored too. Focusing an input puts the caret at the end, which
 * moves it out from under someone editing the middle of what they typed — a
 * quieter version of the same defect.
 */

/**
 * Runs `repaint`, and gives `field` its focus and selection back if it had them.
 *
 * Nothing is restored when the field was not focused: putting focus where the
 * person did not leave it is its own bug, and one that steals the caret from
 * whatever they were actually using.
 */
export function keepingFocus(field: HTMLInputElement, repaint: () => void): void {
  const hadFocus = field.ownerDocument.activeElement === field
  const start = field.selectionStart
  const end = field.selectionEnd

  repaint()

  if (!hadFocus) return
  field.focus()
  if (start === null || end === null) return
  try {
    field.setSelectionRange(start, end)
  } catch {
    // Not every input type carries a selection — `type=email` refuses in some
    // engines. Focus is the part that matters; the caret is the courtesy.
  }
}
