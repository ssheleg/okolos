import type { LeakInventory } from '@okolos/core-leaks'

/**
 * SCR-08 — what is known to have leaked, and what was not checked.
 *
 * The coverage line is not a footnote here; it sits with the total, because a
 * number whose basis is unstated is the thing this screen exists to replace. A
 * list assembled from two of three sources says so in the same breath as its
 * count, and "nothing found" from a source that never answered is never shown
 * as reassurance.
 *
 * The attribution is not decoration either. Have I Been Pwned's breach data is
 * CC BY 4.0, which requires credit wherever the data appears — so it appears
 * here, on the screen that shows it, rather than only in a README a user will
 * never open. It is rendered in every state, including the empty one: a result
 * of "nothing found" is still a result computed from someone else's work.
 */

/** Required by CC BY 4.0 wherever the data is shown. */
export const HIBP_ATTRIBUTION =
  'Breach data from Have I Been Pwned, used under CC BY 4.0.'

export type LeaksState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'ready'; readonly inventory: LeakInventory }
  | { readonly kind: 'error'; readonly message: string }

export interface LeaksHandlers {
  readonly onCheck: () => void
  readonly onResolve: (leakName: string) => void
}

export function renderLeaks(doc: Document, state: LeaksState, handlers: LeaksHandlers): HTMLElement {
  const root = doc.createElement('section')
  root.setAttribute('data-role', 'leaks')
  root.setAttribute('data-state', state.kind)

  const heading = doc.createElement('h1')
  heading.textContent = 'What has leaked'
  root.append(heading)

  if (state.kind === 'idle') {
    root.append(
      text(doc, 'idle', 'Nothing has been looked up yet. Checking sends a hashed form of your address, never the address itself.'),
      button(doc, 'check', 'Check now', handlers.onCheck, true),
      attribution(doc),
    )
    return root
  }

  if (state.kind === 'checking') {
    root.append(text(doc, 'status', 'Asking the sources…'), attribution(doc))
    return root
  }

  if (state.kind === 'error') {
    root.append(
      text(doc, 'error', `The check could not be completed: ${state.message}`),
      text(doc, 'error-note', 'This is not a statement that nothing has leaked.'),
      button(doc, 'check', 'Try again', handlers.onCheck),
      attribution(doc),
    )
    return root
  }

  const { inventory } = state
  root.append(
    text(
      doc,
      'total',
      inventory.leaks.length === 0
        ? 'No breaches were found for this address.'
        : `${inventory.leaks.length} breach${inventory.leaks.length === 1 ? '' : 'es'} found.`,
    ),
    // Always, and next to the number rather than beneath the fold.
    text(doc, 'coverage', inventory.coverage),
  )

  for (const leak of inventory.leaks) {
    const row = doc.createElement('article')
    row.setAttribute('data-role', 'leak')
    row.append(
      text(doc, 'name', `${leak.name}${leak.occurredAt ? ` (${leak.occurredAt})` : ''}`),
      text(doc, 'classes', `Exposed: ${leak.classes.join(', ') || 'not stated by the source'}`),
      button(doc, 'resolve', 'I have dealt with this', () => handlers.onResolve(leak.name)),
    )
    root.append(row)
  }

  root.append(button(doc, 'check', 'Check again', handlers.onCheck), attribution(doc))
  return root
}

function attribution(doc: Document): HTMLElement {
  const el = doc.createElement('p')
  el.setAttribute('data-role', 'attribution')
  el.textContent = HIBP_ATTRIBUTION
  return el
}

function text(doc: Document, role: string, content: string): HTMLParagraphElement {
  const el = doc.createElement('p')
  el.setAttribute('data-role', role)
  el.textContent = content
  return el
}

function button(
  doc: Document,
  role: string,
  label: string,
  onClick: () => void,
  primary = false,
): HTMLButtonElement {
  const el = doc.createElement('button')
  el.type = 'button'
  el.setAttribute('data-role', role)
  if (primary) el.setAttribute('data-primary', 'true')
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}
