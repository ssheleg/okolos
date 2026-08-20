/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest'

import { createOverlayHost } from './host.js'

/**
 * The host element, and the one line of page script that used to remove it.
 *
 * `document.createElement('okolos-banner')` returns whatever class the page has
 * registered under that name, and a custom element's constructor may attach its
 * own shadow root — which makes the extension's `attachShadow` throw. Measured in
 * Chromium on 2026-08-20: with three lines of script in the page's head there was
 * no host, no panel and no warning, on any page that wanted none. It is not a CSS
 * attack, so it was not what the row was filed about, and it defeated the same
 * sentence in ADR-0001 more completely than any stylesheet did.
 */

describe('the canonical name, while it is free', () => {
  it('uses it, so selectors and specs keep working on an ordinary page', () => {
    const { host, renamed } = createOverlayHost(document, 'banner')
    expect(host.tagName.toLowerCase()).toBe('okolos-banner')
    expect(renamed).toBe(false)
  })

  it('marks the surface with the attribute everything should match on', () => {
    // The tag name is the part a page can contest; the attribute is set here so
    // no caller can forget it and no test has to depend on the name.
    const { host } = createOverlayHost(document, 'gate')
    expect(host.getAttribute('data-okolos')).toBe('gate')
  })

  it('attaches a shadow root, since a surface with nowhere to draw is not one', () => {
    const { root } = createOverlayHost(document, 'inspector')
    expect(root).toBeTruthy()
  })
})

describe('when the page has taken the name', () => {
  it('uses one the page could not have predicted', () => {
    // A page cannot pre-register a name it cannot guess, and the suffix comes
    // from the platform's CSPRNG rather than from a counter it could follow.
    class Squatter extends window.HTMLElement {
      constructor() {
        super()
        this.attachShadow({ mode: 'closed' })
      }
    }
    window.customElements.define('okolos-squatted', Squatter)

    const { host, root, renamed } = createOverlayHost(document, 'squatted')
    expect(renamed).toBe(true)
    expect(host.tagName.toLowerCase()).not.toBe('okolos-squatted')
    expect(host.tagName.toLowerCase()).toMatch(/^okolos-squatted-[0-9a-f]{8}$/)
    expect(root).toBeTruthy()
    expect(host.getAttribute('data-okolos')).toBe('squatted')
  })

  it('does not construct the page’s class in order to find out', () => {
    /**
     * The registry is consulted first, and not as an optimisation: constructing
     * the page's element runs the page's constructor inside the document, and
     * whatever it does there it does before we can decide anything. The `catch`
     * below it is the belt for a name that is registered later or fails for some
     * other reason.
     */
    let constructed = 0
    class Counter extends window.HTMLElement {
      constructor() {
        super()
        constructed += 1
        this.attachShadow({ mode: 'closed' })
      }
    }
    window.customElements.define('okolos-counted', Counter)

    createOverlayHost(document, 'counted')
    expect(constructed).toBe(0)
  })

  it('gives every surface its own unpredictable name rather than one shared suffix', () => {
    class Any extends window.HTMLElement {
      constructor() {
        super()
        this.attachShadow({ mode: 'closed' })
      }
    }
    window.customElements.define('okolos-twice', Any)

    const first = createOverlayHost(document, 'twice').host.tagName
    const second = createOverlayHost(document, 'twice').host.tagName
    expect(first).not.toBe(second)
  })
})
