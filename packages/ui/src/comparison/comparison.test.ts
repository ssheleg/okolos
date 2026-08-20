/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mountComparison, type ComparisonHandlers, type ComparisonProps } from './comparison.js'

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

/**
 * Mounts and hands back the panel *inside the shadow root*.
 *
 * The tests below all reach for `[data-role=…]`, and every one of them used to
 * find those in the page's own body — which is exactly what was wrong with the
 * surface. Reading them out of the shadow root is the same set of assertions
 * about the same markup, in the place it now lives.
 */
function render(props: ComparisonProps, h = handlers()): HTMLElement {
  const mounted = mountComparison(document, props, h)
  mountedHandles.push(mounted)
  const panel = mounted.root.querySelector<HTMLElement>('[data-role=comparison]')
  if (!panel) throw new Error('the comparison mounted without its panel')
  return panel
}

const mountedHandles: Array<{ destroy(): void }> = []

const role = (root: HTMLElement, name: string) => root.querySelector<HTMLElement>(`[data-role=${name}]`)

beforeEach(() => {
  for (const handle of mountedHandles.splice(0)) handle.destroy()
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

describe('the surface the page does not own', () => {
  /**
   * Until 2026-08-20 this was a bare `<section>` in `document.body`: no shadow
   * root, no stylesheet, not one line of CSS in the module. The page it warns
   * about could read it, restyle it and remove it — and it did not need to try,
   * because the a11y fixture's own `* { font-size: 6px; color: #eee }` already
   * rendered it as grey on grey. ADR-0001 named three surfaces and this was the
   * fourth.
   */
  it('mounts into a shadow root of its own rather than into the page', () => {
    const mounted = mountComparison(document, PROPS, handlers())
    mountedHandles.push(mounted)
    expect(mounted.root).toBeTruthy()
    // Nothing of the comparison is reachable from the page's own tree.
    expect(document.querySelector('[data-role=comparison]')).toBeNull()
    expect(document.querySelector('[data-okolos=comparison]')).toBe(mounted.host)
  })

  it('brings its own stylesheet, so the page’s cascade decides nothing', () => {
    const mounted = mountComparison(document, PROPS, handlers())
    mountedHandles.push(mounted)
    const css = mounted.root.querySelector('style')?.textContent ?? ''
    expect(css.length, 'the module shipped no CSS at all until this existed').toBeGreaterThan(200)
    // The tokens, and therefore the armour that comes with them.
    expect(css).toContain('--ok-colour-text')
    expect(css).toContain('display: block !important')
  })

  it('draws itself only from the shared tokens, with no palette of its own', () => {
    // Three surfaces once accumulated twenty-two hexes between them, a second
    // palette that resembled the first closely enough to drift unnoticed.
    const css = mountComparison(document, PROPS, handlers()).root.querySelector('style')
      ?.textContent ?? ''
    const body = css.slice(css.indexOf('[data-role=comparison]'))
    expect(body.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([])
  })

  it('keeps the address at full size, since one character is the whole finding', () => {
    const css = mountComparison(document, PROPS, handlers()).root.querySelector('style')
      ?.textContent ?? ''
    expect(css).toMatch(/code \{[^}]*font-size: var\(--ok-type-size-base\)/)
  })

  it('replaces itself rather than stacking when opened twice', () => {
    const first = mountComparison(document, PROPS, handlers())
    first.destroy()
    const second = mountComparison(document, PROPS, handlers())
    mountedHandles.push(second)
    expect(document.querySelectorAll('[data-okolos=comparison]')).toHaveLength(1)
  })

  it('leaves nothing behind when it closes', () => {
    const mounted = mountComparison(document, PROPS, handlers())
    mounted.destroy()
    expect(document.querySelector('[data-okolos=comparison]')).toBeNull()
  })
})
