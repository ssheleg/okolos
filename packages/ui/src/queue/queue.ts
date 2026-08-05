import type { Queue, QueueItem } from '@okolos/core-queue'

/**
 * SCR-07 — the findings queue.
 *
 * One implementation, shown in two places: the popup and the first-run screen.
 * They are the same list and must not drift, because the whole promise is that
 * whatever the user faces is at most three things and always the same three.
 *
 * Everything the ranker held back is counted out loud. A hidden remainder is
 * how an inbox of 203 alerts starts.
 *
 * Each item carries the two verbs that let the list actually end: "Done" and
 * "Not now". Until they existed the only control opened the page, so the queue
 * could be read and never cleared — a finishable list with no finishing move.
 */

export interface QueueHandlers {
  readonly onAct: (itemId: string) => void
  readonly onShowAll: () => void
  /** The user has dealt with it. It leaves the queue and the next item rises. */
  readonly onResolve: (itemId: string) => void
  /** Not today. It ranks last for a while rather than disappearing. */
  readonly onDefer: (itemId: string) => void
}

export function renderQueue(doc: Document, queue: Queue, handlers: QueueHandlers): HTMLElement {
  const list = doc.createElement('div')
  list.setAttribute('data-role', 'queue')

  if (queue.shown.length === 0) {
    list.append(text(doc, 'queue-empty', 'Nothing needs you right now.'))
    return list
  }

  for (const item of queue.shown) list.append(row(doc, item, handlers))

  if (queue.rankedBy === 'severity-only') {
    // Saying "ranked by severity alone" costs a line. Presenting a reduced
    // ranking as the considered one costs the user's trust the first time they
    // notice the order makes no sense.
    list.append(
      text(
        doc,
        'ranking-note',
        'Ordered by severity alone — the rest of the ranking data is unavailable.',
      ),
    )
  }

  if (queue.hidden > 0) {
    list.append(button(doc, 'show-all', `Show all (${queue.hidden} more)`, handlers.onShowAll))
  }

  return list
}

function row(doc: Document, item: QueueItem, handlers: QueueHandlers): HTMLElement {
  const el = doc.createElement('article')
  el.setAttribute('data-role', 'item')
  el.setAttribute('data-severity', item.severity)
  const actions = doc.createElement('div')
  actions.setAttribute('data-role', 'item-actions')
  actions.append(
    button(doc, 'act', item.actionLabel ?? 'Open', () => handlers.onAct(item.id)),
    button(doc, 'resolve', 'Done', () => handlers.onResolve(item.id)),
    button(doc, 'defer', 'Not now', () => handlers.onDefer(item.id)),
  )

  el.append(text(doc, 'summary', item.summary), actions)
  return el
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
