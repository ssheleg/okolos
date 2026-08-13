/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { fromCatalogue, useResolver, type Catalogue } from '@okolos/i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderOverview, type AreaRow, type AttentionItem, type OverviewState } from './overview.js'

/**
 * The shipped Russian catalogue, not a stub.
 *
 * `default_locale` is `ru`, and a fake catalogue lets a missing key pass as
 * whatever the test decided to put there — a test that agrees with itself.
 */
const CATALOGUE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'apps/extension/_locales/ru/messages.json'),
    'utf8',
  ),
) as Catalogue

beforeEach(() => {
  useResolver(fromCatalogue(CATALOGUE))
})

const AREAS: readonly AreaRow[] = [
  { id: 'queue', label: 'Что требует вас', href: '#queue', state: '2 из 6' },
  { id: 'journal', label: 'Что изменилось', href: '#journal', state: 'с 10 августа' },
  { id: 'leaks', label: 'Утечки', href: '#leaks', state: 'проверено 8 августа' },
  { id: 'extensions', label: 'Расширения', href: '#extensions', state: '1 изменение' },
  { id: 'trusted', label: 'Доверенные сайты', href: '#trusted', state: 'пусто' },
  { id: 'recovery', label: 'Восстановление', href: '#recovery', state: 'нет инцидентов' },
  { id: 'audit', label: 'Что отправлено', href: '#audit', state: '5 отправок' },
  { id: 'data', label: 'Ваши данные', href: '#data', state: '90 дней' },
]

const item = (over: Partial<AttentionItem> = {}): AttentionItem => ({
  severity: 'critical',
  what: 'Скрытая инструкция',
  where: 'example.com',
  when: '2 часа назад',
  area: 'queue',
  href: '#queue',
  ...over,
})

const handlers = () => ({ onOpen: vi.fn(), onRepair: vi.fn() })

function render(state: OverviewState, h = handlers()): HTMLElement {
  return renderOverview(document, state, h)
}

const ready = (over: Partial<Extract<OverviewState, { kind: 'ready' }>> = {}): OverviewState => ({
  kind: 'ready',
  attention: [item()],
  areas: AREAS,
  lastChecked: 'сегодня в 9:00',
  ...over,
})

describe('the band answers "what needs me" before anything is opened', () => {
  it('shows at most three, and counts the rest', () => {
    const el = render(ready({ attention: [item(), item(), item(), item(), item()] }))
    expect(el.querySelectorAll('[data-role=attention-item]')).toHaveLength(3)
    expect(el.querySelector('[data-role=attention-more]')?.textContent).toContain('2')
  })

  it('shows no remainder line when everything fits', () => {
    const el = render(ready({ attention: [item(), item()] }))
    expect(el.querySelector('[data-role=attention-more]')).toBeNull()
  })

  it('carries severity as a word, not only as a mark', () => {
    const el = render(ready({ attention: [item({ severity: 'critical' })] }))
    const word = el.querySelector('[data-role=attention-severity]')?.textContent ?? ''
    expect(word).not.toBe('')
    expect(word).not.toMatch(/^\[/) // an unresolved key, not a word
    // The mark is decoration and is hidden from assistive technology, so the
    // word has to carry the meaning on its own.
    expect(el.querySelector('[data-role=attention-mark]')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('shows where a finding came from and when', () => {
    const el = render(ready({ attention: [item({ where: 'shop.test', when: 'вчера' })] }))
    const origin = el.querySelector('[data-role=attention-origin]')?.textContent ?? ''
    expect(origin).toContain('shop.test')
    expect(origin).toContain('вчера')
  })

  it('drops the source but keeps the time when a finding has no place', () => {
    const el = render(ready({ attention: [item({ where: null, when: 'вчера' })] }))
    expect(el.querySelector('[data-role=attention-origin]')?.textContent).toBe('вчера')
  })

  it('opens the area that owns the item', () => {
    const h = handlers()
    render(ready({ attention: [item({ area: 'leaks', href: '#leaks' })] }), h)
      .querySelector<HTMLAnchorElement>('[data-role=attention-link]')
      ?.click()
    expect(h.onOpen).toHaveBeenCalledWith('leaks')
  })
})

describe('an empty band says when it was last true', () => {
  it('never says "nothing needs you" without a time beside it', () => {
    const el = render(ready({ attention: [], lastChecked: 'сегодня в 9:00' }))
    expect(el.querySelector('[data-role=attention-empty]')).not.toBeNull()
    expect(el.querySelector('[data-role=attention-checked]')?.textContent).toContain('9:00')
  })

  it('says it has never checked rather than implying it just did', () => {
    const el = render(ready({ attention: [], lastChecked: null }))
    const checked = el.querySelector('[data-role=attention-checked]')?.textContent ?? ''
    expect(checked).not.toBe('')
    expect(checked).not.toMatch(/^\[/)
  })
})

describe('a state that could not be read is never rendered as calm', () => {
  it('marks an unread area and says so in words', () => {
    const areas = AREAS.map((a) => (a.id === 'extensions' ? { ...a, state: null } : a))
    const el = render(ready({ areas }))
    const row = el.querySelector('[data-area=extensions] [data-role=area-state]')
    expect(row?.getAttribute('data-unread')).toBe('true')
    const said = row?.textContent ?? ''
    expect(said).not.toBe('')
    expect(said).not.toMatch(/^\[/)
    // The failure mode in one assertion: an unread state must not borrow the
    // word an empty one uses.
    const empty = el.querySelector('[data-area=trusted] [data-role=area-state]')?.textContent
    expect(said).not.toBe(empty)
  })

  it('still offers the area — unread is not unreachable', () => {
    const areas = AREAS.map((a) => (a.id === 'extensions' ? { ...a, state: null } : a))
    const el = render(ready({ areas }))
    expect(el.querySelector('[data-area=extensions] [data-role=area-link]')).not.toBeNull()
  })

  it('leaves every other row alone', () => {
    const areas = AREAS.map((a) => (a.id === 'extensions' ? { ...a, state: null } : a))
    const el = render(ready({ areas }))
    expect(el.querySelectorAll('[data-unread=true]')).toHaveLength(1)
  })
})

describe('the whole store being unreadable is its own state', () => {
  it('names the failure and offers repair', () => {
    const h = handlers()
    const el = render({ kind: 'error', message: 'QuotaExceededError', areas: AREAS }, h)
    expect(el.querySelector('[data-role=attention-error]')?.textContent).toContain(
      'QuotaExceededError',
    )
    el.querySelector<HTMLButtonElement>('[data-role=overview-repair]')?.click()
    expect(h.onRepair).toHaveBeenCalled()
  })

  it('claims nothing about the band', () => {
    const el = render({ kind: 'error', message: 'boom', areas: AREAS })
    expect(el.querySelector('[data-role=attention-empty]')).toBeNull()
    expect(el.querySelector('[data-role=attention-list]')).toBeNull()
  })
})

describe('loading is visible, and the shell does not wait for data', () => {
  it('paints every area row while the counts are still being read', () => {
    const el = render({ kind: 'loading', areas: AREAS })
    expect(el.querySelectorAll('[data-role=area]')).toHaveLength(8)
    expect(el.querySelector('[data-role=attention-counting]')).not.toBeNull()
  })
})

describe('the areas are navigable without a router', () => {
  it('renders every area as a real link carrying its address', () => {
    const el = render(ready())
    const links = [...el.querySelectorAll<HTMLAnchorElement>('[data-role=area-link]')]
    expect(links).toHaveLength(8)
    expect(links.map((a) => a.getAttribute('href'))).toEqual(AREAS.map((a) => a.href))
  })

  it('is a nav with a name, so it is skippable', () => {
    const el = render(ready())
    const nav = el.querySelector('[data-role=areas]')
    expect(nav?.tagName.toLowerCase()).toBe('nav')
    expect(nav?.getAttribute('aria-label')).not.toBe('')
  })
})

describe('an address nobody understood is named on the page', () => {
  it('says which one, rather than looking like an ordinary visit', () => {
    const el = render(ready({ unrecognised: '#settings' }))
    expect(el.querySelector('[data-role=overview-unrecognised]')?.textContent).toContain('#settings')
  })

  it('says nothing when the visit was ordinary', () => {
    expect(render(ready()).querySelector('[data-role=overview-unrecognised]')).toBeNull()
  })
})
