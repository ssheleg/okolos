import { shadowMode } from './shadow.js'

/**
 * A host element the page cannot take away by taking its name.
 *
 * `document.createElement('okolos-banner')` returns whatever class the page has
 * registered under that name, and a custom element's constructor may attach its
 * own shadow root. So one line of page script —
 *
 *     customElements.define('okolos-banner', class extends HTMLElement {
 *       constructor() { super(); this.attachShadow({ mode: 'closed' }) }
 *     })
 *
 * — makes the extension's own `attachShadow` throw, and **every in-page surface
 * the product has stops existing**. Measured in Chromium on 2026-08-20: no host,
 * no panel, no warning, on any page that wants none. It is not a CSS attack and
 * so it was not what B-38 was filed about, but it defeats the same sentence in
 * ADR-0001 more completely than any stylesheet does.
 *
 * The defence is that a page cannot pre-register a name it cannot predict. The
 * canonical name is tried first, so selectors and specs keep working on the
 * overwhelming majority of pages; when it is taken — or when attaching throws
 * for any other reason — a name with a random suffix is used instead. The
 * `data-okolos` attribute is what anything looking for the surface should match
 * on, and it is set here so no caller can forget.
 */
export interface OverlayHost {
  readonly host: HTMLElement
  readonly root: ShadowRoot
  /** True when the canonical name was unavailable — worth journalling. */
  readonly renamed: boolean
}

/** Eight hex characters from the platform's CSPRNG: not guessable in advance. */
function unpredictableSuffix(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function createOverlayHost(doc: Document, kind: string): OverlayHost {
  const canonical = `okolos-${kind}`
  const registry = doc.defaultView?.customElements

  const names = registry?.get(canonical)
    ? // Already registered by somebody else. Do not even try it: constructing it
      // runs their constructor inside our page's document.
      [`${canonical}-${unpredictableSuffix()}`]
    : [canonical, `${canonical}-${unpredictableSuffix()}`]

  for (const name of names) {
    try {
      const host = doc.createElement(name)
      const root = host.attachShadow({ mode: shadowMode() })
      host.setAttribute('data-okolos', kind)
      return { host, root, renamed: name !== canonical }
    } catch {
      // The page owns this name and its constructor took the shadow root. Try
      // one it could not have known about.
    }
  }

  // Both attempts failed, which the second cannot do by name collision — so
  // something else is wrong and pretending otherwise would hand back a surface
  // with no root to draw in.
  // i18n-exempt: quoted verbatim into one journal line beside the browser's own error
  // messages (`noteScanFailed`), where the field is a diagnostic for whoever reports
  // this and not a sentence written for a reader
  throw new Error('okolos: no shadow root could be attached for the overlay')
}
