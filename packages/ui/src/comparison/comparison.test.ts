/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderComparison, type ComparisonHandlers, type ComparisonProps } from './comparison.js'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fromCatalogue, useResolver, type Catalogue } from '@okolos/i18n'

/** The shipped Russian catalogue: `default_locale` is `ru`, and a fake would let a missing key pass. */
const CATALOGUE = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../../../../apps/extension/_locales/ru/messages.json'),
    'utf8',
  ),
) as Catalogue

useResolver(fromCatalogue(CATALOGUE))

const PROPS: ComparisonProps = {
  visited: 'xn--pypal-4ve.com',
  decoded: 'pаypal.com',
  resembles: 'paypal.com',
  kind: 'mixed-script',
}

function handlers(overrides: Partial<ComparisonHandlers> = {}): ComparisonHandlers {
  return { onLeave: vi.fn(), onTrust: vi.fn(), onClose: vi.fn(), ...overrides }
}

function render(props: ComparisonProps, h = handlers()): HTMLElement {
  const el = renderComparison(document, props, h)
  document.body.append(el)
  return el
}

const role = (root: HTMLElement, name: string) => root.querySelector<HTMLElement>(`[data-role=${name}]`)

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('showing the difference rather than asserting it', () => {
  it('puts both names on the page', () => {
    const el = render(PROPS)
    expect(role(el, 'visited')?.textContent).toContain('xn--pypal-4ve.com')
    expect(role(el, 'resembles')?.textContent).toContain('paypal.com')
  })

  it('shows the decoded spelling, which is the whole point', () => {
    expect(role(render(PROPS), 'decoded')?.textContent).toContain('pаypal.com')
  })

  it('does not repeat itself when there is nothing to decode', () => {
    const el = render({ ...PROPS, visited: 'payp4l.com', decoded: 'payp4l.com', kind: 'typo' })
    expect(role(el, 'decoded')).toBeNull()
  })

  it('says in one sentence what kind of trick this is', () => {
    expect(role(render(PROPS), 'why')?.textContent).toMatch(/из нескольких алфавитов/i)
    expect(role(render({ ...PROPS, kind: 'tld-swap' }), 'why')?.textContent).toMatch(/окончание после последней точки/i)
  })

  it('shows the address verbatim, not tidied up', () => {
    const el = render(PROPS)
    expect(el.querySelector('code')?.textContent).toBe('xn--pypal-4ve.com')
  })
})

describe('what the user can do', () => {
  it('offers leaving as the primary action', () => {
    expect(role(render(PROPS), 'leave')?.getAttribute('data-primary')).toBe('true')
  })

  it('lets them say it is legitimate, and says that this is reversible', () => {
    const h = handlers()
    const el = render(PROPS, h)
    role(el, 'trust')?.click()
    expect(h.onTrust).toHaveBeenCalledTimes(1)
    expect(role(el, 'trust-note')?.textContent).toMatch(/в настройках/i)
  })

  it('is a dialog to assistive technology', () => {
    expect(render(PROPS).getAttribute('role')).toBe('dialog')
  })
})
