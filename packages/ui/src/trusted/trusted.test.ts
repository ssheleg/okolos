/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderTrusted, type TrustedDomain, type TrustedHandlers } from './trusted.js'

function handlers(overrides: Partial<TrustedHandlers> = {}): TrustedHandlers {
  return { onRevoke: vi.fn(), ...overrides }
}

const ENTRY: TrustedDomain = {
  domain: 'g00gle.com',
  grantedAt: '2026-08-05T12:34:56.000Z',
  reason: 'marked legitimate by the user',
}

function render(domains: readonly TrustedDomain[], h = handlers()): HTMLElement {
  const el = renderTrusted(document, domains, h)
  document.body.append(el)
  return el
}

const role = (root: HTMLElement, name: string) => root.querySelector<HTMLElement>(`[data-role=${name}]`)

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('taking trust back', () => {
  it('lists what the user trusted', () => {
    const el = render([ENTRY])
    expect(role(el, 'domain')?.textContent).toBe('g00gle.com')
  })

  it('revokes on request, naming the domain', () => {
    // The comparison view promises this in those words: "can be undone in
    // settings". Until this list existed the promise was false.
    const h = handlers()
    render([ENTRY], h).querySelector<HTMLElement>('[data-role=revoke]')?.click()
    expect(h.onRevoke).toHaveBeenCalledWith('g00gle.com')
  })

  it('says when the trust was granted, and why', () => {
    const el = render([ENTRY])
    expect(role(el, 'granted')?.textContent).toContain('2026-08-05')
    expect(role(el, 'granted')?.textContent).toContain('marked legitimate')
  })

  it('shows the date alone when there is no reason recorded', () => {
    const el = render([{ domain: 'bank.test', grantedAt: '2026-01-02T00:00:00.000Z' }])
    expect(role(el, 'granted')?.textContent).toBe('Trusted on 2026-01-02')
  })

  it('says taking one back takes effect at once', () => {
    expect(role(render([ENTRY]), 'trusted-note')?.textContent).toMatch(/immediately/i)
  })

  it('lists every entry, not just the first', () => {
    const el = render([ENTRY, { domain: 'other.test', grantedAt: '2026-02-02T00:00:00.000Z' }])
    expect(el.querySelectorAll('[data-role=trusted-row]')).toHaveLength(2)
  })
})

describe('when nothing is trusted', () => {
  it('says so, and says what would put something here', () => {
    // An empty area would read as a broken screen rather than an empty list.
    const el = render([])
    expect(role(el, 'trusted-empty')?.textContent).toMatch(/have not marked any site/i)
    expect(el.querySelectorAll('[data-role=trusted-row]')).toHaveLength(0)
  })
})
