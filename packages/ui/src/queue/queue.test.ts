/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Queue, QueueItem } from '@okolos/core-queue'

import { renderQueue, type QueueHandlers } from './queue.js'

function handlers(overrides: Partial<QueueHandlers> = {}): QueueHandlers {
  return {
    onAct: vi.fn(),
    onShowAll: vi.fn(),
    onResolve: vi.fn(),
    onDefer: vi.fn(),
    ...overrides,
  }
}

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: 'i1',
    severity: 'major',
    createdAt: '2026-08-05T00:00:00.000Z',
    fixability: 'one-click',
    summary: 'Hidden instruction on example.test',
    actionLabel: 'Neutralise it',
    ...overrides,
  }
}

function render(queue: Queue, h = handlers()): HTMLElement {
  const el = renderQueue(document, queue, h)
  document.body.append(el)
  return el
}

const role = (root: HTMLElement, name: string) => root.querySelector<HTMLElement>(`[data-role=${name}]`)

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('what the queue shows', () => {
  it('renders the items it was handed', () => {
    const el = render({ shown: [item(), item({ id: 'i2' })], hidden: 0, rankedBy: 'full' })
    expect(el.querySelectorAll('[data-role=item]')).toHaveLength(2)
  })

  it('says nothing needs the user when there is nothing', () => {
    const el = render({ shown: [], hidden: 0, rankedBy: 'full' })
    expect(role(el, 'queue-empty')?.textContent).toMatch(/nothing needs you/i)
  })

  it('counts what it holds back rather than hiding it', () => {
    const el = render({ shown: [item()], hidden: 12, rankedBy: 'full' })
    expect(role(el, 'show-all')?.textContent).toContain('12')
  })

  it('offers no "show all" when there is nothing behind it', () => {
    expect(role(render({ shown: [item()], hidden: 0, rankedBy: 'full' }), 'show-all')).toBeNull()
  })

  it('says when the ranking is reduced rather than presenting it as considered', () => {
    const el = render({ shown: [item()], hidden: 0, rankedBy: 'severity-only' })
    expect(role(el, 'ranking-note')?.textContent).toMatch(/severity/i)
  })
})

describe('the two verbs that let the list end', () => {
  it('marks an item done', () => {
    // Until these existed the only control opened the page, so the queue could
    // be read and never cleared — a finishable list with no finishing move.
    const h = handlers()
    const el = render({ shown: [item()], hidden: 0, rankedBy: 'full' }, h)
    role(el, 'resolve')?.click()
    expect(h.onResolve).toHaveBeenCalledWith('i1')
  })

  it('defers an item without pretending it is gone', () => {
    const h = handlers()
    const el = render({ shown: [item()], hidden: 0, rankedBy: 'full' }, h)
    role(el, 'defer')?.click()
    expect(h.onDefer).toHaveBeenCalledWith('i1')
  })

  it('keeps the item’s own action alongside them', () => {
    const el = render({ shown: [item()], hidden: 0, rankedBy: 'full' })
    const labels = [...el.querySelectorAll('[data-role=item-actions] button')].map(
      (button) => button.textContent,
    )
    expect(labels).toEqual(['Neutralise it', 'Done', 'Not now'])
  })
})
