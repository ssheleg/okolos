import type { Queue, QueueItem } from '@okolos/core-queue'

/**
 * SCR-02 — the popup.
 *
 * It answers one question in about three seconds: is this page fine, and is
 * anything waiting for me. Everything else is a link.
 *
 * Two rules it never bends. It does not show a clean verdict it could not
 * compute — while checking it says it is checking, and on a storage failure it
 * says that, because "nothing needs you" is the most damaging sentence in the
 * product to say wrongly. And the queue shows only what the ranker handed it,
 * with the remainder counted out loud: a hidden remainder is how an inbox of
 * 203 alerts starts.
 */

export type PageVerdict = 'clean' | 'finding' | 'unknown'

export type PopupState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready'
      readonly page: { readonly verdict: PageVerdict; readonly reason: string }
      readonly queue: Queue
      readonly changed: number
      readonly lastCheck: string | null
    }

export interface PopupHandlers {
  readonly onAct: (itemId: string) => void
  readonly onShowAll: () => void
  readonly onWhatChanged: () => void
  readonly onOpen: (target: 'self-audit' | 'journal' | 'settings') => void
  readonly onRepair: () => void
}

export function renderPopup(
  doc: Document,
  state: PopupState,
  handlers: PopupHandlers,
): HTMLElement {
  const root = doc.createElement('section')
  root.setAttribute('data-role', 'popup')
  root.setAttribute('data-state', state.kind)

  if (state.kind === 'loading') {
    root.append(text(doc, 'status', 'Checking this page…'))
    return root
  }

  if (state.kind === 'error') {
    root.append(
      text(doc, 'error', `Local data could not be read: ${state.message}`),
      text(
        doc,
        'error-note',
        'This is a storage problem. It is not a statement that this page is fine.',
      ),
      button(doc, 'repair', 'Repair storage', handlers.onRepair),
    )
    root.append(footer(doc, handlers))
    return root
  }

  root.setAttribute('data-verdict', state.page.verdict)
  root.append(text(doc, 'verdict', state.page.reason))
  root.append(changedLine(doc, state.changed, state.lastCheck, handlers))
  root.append(queueBlock(doc, state.queue, handlers))
  root.append(footer(doc, handlers))
  return root
}

function changedLine(
  doc: Document,
  changed: number,
  lastCheck: string | null,
  handlers: PopupHandlers,
): HTMLElement {
  const el = doc.createElement('button')
  el.type = 'button'
  el.setAttribute('data-role', 'changed')
  el.textContent =
    changed > 0
      ? `${changed} new since your last check`
      : `Nothing new since ${lastCheck ? shortTime(lastCheck) : 'your first run'}`
  el.addEventListener('click', handlers.onWhatChanged)
  return el
}

function queueBlock(doc: Document, queue: Queue, handlers: PopupHandlers): HTMLElement {
  const list = doc.createElement('div')
  list.setAttribute('data-role', 'queue')

  if (queue.shown.length === 0) {
    list.append(text(doc, 'queue-empty', 'Nothing needs you right now.'))
    return list
  }

  for (const item of queue.shown) list.append(itemRow(doc, item, handlers))

  if (queue.rankedBy === 'severity-only') {
    // Saying "ranked by severity alone" costs a line. Presenting a reduced
    // ranking as the considered one costs the user's trust the first time they
    // notice the order makes no sense.
    list.append(
      text(doc, 'ranking-note', 'Ordered by severity alone — the rest of the ranking data is unavailable.'),
    )
  }

  if (queue.hidden > 0) {
    list.append(button(doc, 'show-all', `Show all (${queue.hidden} more)`, handlers.onShowAll))
  }

  return list
}

function itemRow(doc: Document, item: QueueItem, handlers: PopupHandlers): HTMLElement {
  const row = doc.createElement('article')
  row.setAttribute('data-role', 'item')
  row.setAttribute('data-severity', item.severity)
  row.append(text(doc, 'summary', item.summary))
  row.append(
    button(doc, 'act', item.actionLabel ?? 'Open', () => handlers.onAct(item.id)),
  )
  return row
}

function footer(doc: Document, handlers: PopupHandlers): HTMLElement {
  const el = doc.createElement('nav')
  el.setAttribute('data-role', 'footer')
  el.append(
    button(doc, 'self-audit', 'What was sent', () => handlers.onOpen('self-audit')),
    button(doc, 'journal', 'Journal', () => handlers.onOpen('journal')),
    button(doc, 'settings', 'Settings', () => handlers.onOpen('settings')),
  )
  return el
}

function shortTime(iso: string): string {
  // Deliberately not localised: one language ships first, and a half-translated
  // timestamp reads worse than an unambiguous one.
  return iso.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
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
): HTMLButtonElement {
  const el = doc.createElement('button')
  el.type = 'button'
  el.setAttribute('data-role', role)
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}
