import { toPortable, type Checklist } from '@okolos/core-recovery'

/**
 * SCR-13 — the recovery checklist.
 *
 * Ordered by damage, not by convenience, and every step carries its reason: a
 * list of instructions without reasons is followed once, badly, and abandoned
 * at the first inconvenient step. Steps that cannot be done in this browser say
 * so, because discovering that halfway through is where people stop — and now
 * they can be taken along, as text the user moves themselves.
 */

export interface RecoveryHandlers {
  readonly onToggle: (stepId: string, done: boolean) => void
  readonly onArchive: () => void
  /** Copies the remaining steps. Optional: the text is on screen either way. */
  readonly onCopy?: (text: string) => void
}

export function renderRecovery(
  doc: Document,
  checklist: Checklist,
  handlers: RecoveryHandlers,
): HTMLElement {
  const root = doc.createElement('section')
  root.setAttribute('data-role', 'recovery')
  root.setAttribute('data-kind', checklist.kind)

  const heading = doc.createElement('h1')
  heading.textContent = 'What to do now'
  root.append(heading)

  if (checklist.generic) {
    root.append(
      text(
        doc,
        'generic',
        'We do not have a checklist for exactly what happened, so this is the broadest safe one.',
      ),
    )
  }

  root.append(
    text(
      doc,
      'progress',
      checklist.remaining === 0
        ? 'Every step is done.'
        : `${checklist.remaining} step${checklist.remaining === 1 ? '' : 's'} left, most important first.`,
    ),
  )

  const list = doc.createElement('ol')
  list.setAttribute('data-role', 'steps')

  for (const step of checklist.steps) {
    const done = checklist.done.includes(step.id)
    const item = doc.createElement('li')
    item.setAttribute('data-role', 'step')
    item.setAttribute('data-step', step.id)
    if (done) item.setAttribute('data-done', 'true')

    const control = doc.createElement('input')
    control.type = 'checkbox'
    control.checked = done
    control.id = `okolos-step-${step.id}`
    control.setAttribute('data-role', 'done')
    control.addEventListener('change', () => handlers.onToggle(step.id, control.checked))

    // Explicitly associated, not merely adjacent: a checkbox whose label is a
    // sibling is an unlabelled checkbox to everything but a sighted mouse user.
    const label = doc.createElement('label')
    label.htmlFor = control.id
    label.textContent = step.title

    item.append(control, label, text(doc, 'why', step.why))
    if (step.elsewhere) {
      item.append(text(doc, 'elsewhere', 'This one cannot be done in this browser.'))
    }
    list.append(item)
  }

  root.append(list)

  if (checklist.remaining === 0) {
    root.append(button(doc, 'archive', 'Archive this incident', handlers.onArchive))
  } else {
    root.append(portableBlock(doc, checklist, handlers))
  }

  return root
}

/**
 * The steps you have to finish somewhere else, in a form you can take there.
 *
 * Not a sync feature. A recovery record says which incident happened to a
 * particular person, and shipping it to a server so it can appear on their
 * phone would trade this product's one real promise for something they can get
 * by pasting text into a note.
 *
 * The text is rendered whether or not the copy button works — a clipboard
 * permission the browser declines must not be the thing that strands someone
 * mid-recovery. And the copy happens on a real click and shows exactly what it
 * copied, which is the distinction this product's own ClickFix detector draws.
 */
function portableBlock(
  doc: Document,
  checklist: Checklist,
  handlers: RecoveryHandlers,
): HTMLElement {
  const portable = toPortable(checklist)
  const block = doc.createElement('section')
  block.setAttribute('data-role', 'portable')

  const heading = doc.createElement('h2')
  heading.textContent = 'Continue on another device'
  block.append(heading)

  block.append(
    text(
      doc,
      'portable-why',
      portable.elsewhere.length === 0
        ? 'Every remaining step can be done here, but you can still take the list with you.'
        : `${portable.elsewhere.length} of the remaining steps cannot be done in this browser. Take the list with you — nothing is sent anywhere.`,
    ),
  )

  const pre = doc.createElement('pre')
  pre.setAttribute('data-role', 'portable-text')
  pre.textContent = portable.text
  block.append(pre)

  if (handlers.onCopy) {
    const copy = handlers.onCopy
    block.append(button(doc, 'copy', 'Copy these steps', () => copy(portable.text)))
  }

  return block
}

function text(doc: Document, role: string, content: string): HTMLParagraphElement {
  const el = doc.createElement('p')
  el.setAttribute('data-role', role)
  el.textContent = content
  return el
}

function button(doc: Document, role: string, label: string, onClick: () => void): HTMLButtonElement {
  const el = doc.createElement('button')
  el.type = 'button'
  el.setAttribute('data-role', role)
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}
