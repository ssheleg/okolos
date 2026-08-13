/**
 * The moment between a press and its result, made visible.
 *
 * Every action on this page did the same thing: send a message, await a
 * database write, then repaint. Between the press and the repaint — several
 * reads, and on a cold service worker not a short time — the row stood exactly
 * as it had. Nothing dimmed, nothing said "working", and the button could be
 * pressed again. A user could not tell a slow action from a dead one, and
 * neither could a test.
 *
 * This marks the control that was pressed and lets the repaint clear it, which
 * it does for free by replacing the tree. Two things it deliberately does not
 * do:
 *
 *   - **It does not claim success.** The row is marked *pending*, not resolved.
 *     This product does not show a result it does not have; an optimistic
 *     update that has to be taken back is a lie with a rollback.
 *   - **It does not hide the control.** A disappearing button reads as "it
 *     worked" just as strongly as a green tick.
 */

/** What the pressed control looked like, so a failure can put it back. */
interface Marked {
  readonly control: HTMLButtonElement
  readonly wasDisabled: boolean
}

function mark(doc: Document, region: Element): Marked | null {
  const active = doc.activeElement
  // A click focuses the button in the engines this ships to; anything else —
  // a keyboard activation from elsewhere, a synthetic call — leaves focus
  // where it was, and marking a control the user is not on would be worse
  // than marking nothing.
  if (!(active instanceof HTMLButtonElement) || !region.contains(active)) return null

  const marked: Marked = { control: active, wasDisabled: active.disabled }
  active.setAttribute('data-pending', 'true')
  // `aria-busy` rather than a live region: the control is the thing that
  // changed, and announcing a whole section would talk over the user.
  active.setAttribute('aria-busy', 'true')
  active.disabled = true
  return marked
}

function unmark(marked: Marked | null): void {
  if (marked === null) return
  const { control, wasDisabled } = marked
  control.removeAttribute('data-pending')
  control.removeAttribute('aria-busy')
  control.disabled = wasDisabled
}

/**
 * Runs `work` with the pressed control marked as pending.
 *
 * On success the caller repaints and the marked control goes with the old tree.
 * On failure the mark is removed and the error is re-thrown, so the caller
 * decides what the user is told — this module does not invent a message, and
 * a swallowed failure here would leave a button that simply stopped working.
 */
export async function whilePending<T>(
  doc: Document,
  region: Element,
  work: () => Promise<T>,
): Promise<T> {
  const marked = mark(doc, region)
  try {
    return await work()
  } catch (cause) {
    unmark(marked)
    throw cause
  }
}
