import type { Checklist } from '@okolos/core-recovery'

/**
 * SCR-13 — the recovery checklist.
 *
 * Ordered by damage, not by convenience, and every step carries its reason: a
 * list of instructions without reasons is followed once, badly, and abandoned
 * at the first inconvenient step. Steps that cannot be done in this browser say
 * so, because discovering that halfway through is where people stop.
 */

export interface RecoveryHandlers {
  readonly onToggle: (stepId: string, done: boolean) => void
  readonly onArchive: () => void
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
    control.setAttribute('data-role', 'done')
    control.addEventListener('change', () => handlers.onToggle(step.id, control.checked))

    const label = doc.createElement('label')
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
  }

  return root
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
