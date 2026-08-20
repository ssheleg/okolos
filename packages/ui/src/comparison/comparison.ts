/**
 * The side-by-side, which is the only thing worth showing for a lookalike.
 *
 * Telling someone "this domain is suspicious" asks them to take our word for
 * it. Putting what they visited next to what it imitates, with the decoded
 * spelling underneath, lets them see the difference themselves — and seeing it
 * once is what makes them notice the next one without us.
 *
 * **The fourth in-page surface, and until 2026-08-20 the only one outside
 * ADR-0001.** It was a bare `<section>` appended to `document.body` — no shadow
 * root, no stylesheet, not one line of CSS in this file — so the page it was
 * warning about owned it completely: it could read it, restyle it, and remove it,
 * and on the hostile fixture the a11y suite already ships it rendered as six-pixel
 * grey on grey. That is not even an attack; it is what any page with a `*` rule
 * does by accident. The other three surfaces were audited by
 * `e2e/a11y-overlays.spec.ts` and this one was not, which is why nobody saw it.
 *
 * It now mounts the way they do, through the same host and the same tokens, and
 * it is audited beside them.
 */

import { t } from '@okolos/i18n'

import { createOverlayHost } from '../host.js'
import { OVERLAY_TOKENS } from '../overlay-tokens.js'

export interface ComparisonProps {
  /** The host as the address bar holds it, punycode and all. */
  readonly visited: string
  /** What it renders as, once decoded. Equal to `visited` for plain ASCII. */
  readonly decoded: string
  readonly resembles: string
  readonly kind:
    | 'mixed-script'
    | 'homograph'
    | 'typo'
    | 'tld-swap'
    | 'brand-subdomain'
    | 'brand-under-login-word'
}

export interface ComparisonHandlers {
  readonly onLeave: () => void
  readonly onTrust: () => void
  readonly onClose: () => void
}

/** The same shape the other three surfaces hand back. */
export interface ComparisonHandle {
  readonly host: HTMLElement
  readonly root: ShadowRoot
  destroy(): void
}

/**
 * The reason, as a catalogue key.
 *
 * Which kind of resemblance gets which explanation is a product decision and
 * stays here; the sentence is a translation and lives in `_locales`.
 */
const EXPLANATION_KEY: Record<ComparisonProps['kind'], string> = {
  'mixed-script': 'comparisonReasonMixedScript',
  homograph: 'comparisonReasonHomograph',
  typo: 'comparisonReasonTypo',
  'tld-swap': 'comparisonReasonTldSwap',
  'brand-subdomain': 'comparisonReasonBrandSubdomain',
  'brand-under-login-word': 'comparisonReasonLoginWord',
}

/**
 * Mounts the comparison into its own closed shadow root and returns the handle.
 *
 * Replaces `renderComparison`, which handed back a naked element for the caller
 * to append. The old shape is what made the omission easy: three surfaces called
 * a `mount*` that owned its host, and the fourth returned a `<section>` — so it
 * read as a fragment of somebody else's screen rather than as a surface of its
 * own, and nothing about it looked like it was missing a shadow root.
 */
export function mountComparison(
  doc: Document,
  props: ComparisonProps,
  handlers: ComparisonHandlers,
): ComparisonHandle {
  const { host, root } = createOverlayHost(doc, 'comparison')
  root.append(styles(doc), panel(doc, props, handlers))
  doc.body.append(host)
  return {
    host,
    root,
    destroy() {
      host.remove()
    },
  }
}

function panel(
  doc: Document,
  props: ComparisonProps,
  handlers: ComparisonHandlers,
): HTMLElement {
  const root = doc.createElement('section')
  root.setAttribute('data-role', 'comparison')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-label', t('comparisonAria'))

  const title = doc.createElement('h2')
  title.textContent = t('comparisonTitle')
  root.append(title)

  root.append(
    row(doc, 'visited', t('comparisonVisited'), props.visited),
    ...(props.decoded === props.visited ? [] : [row(doc, 'decoded', t('comparisonDecoded'), props.decoded)]),
    row(doc, 'resembles', t('comparisonResembles'), props.resembles),
    text(doc, 'why', t(EXPLANATION_KEY[props.kind])),
  )

  const actions = doc.createElement('div')
  actions.setAttribute('data-role', 'actions')
  actions.append(
    button(doc, 'leave', t('comparisonLeave'), handlers.onLeave, true),
    button(doc, 'trust', t('comparisonTrust'), handlers.onTrust),
    button(doc, 'close', t('comparisonClose'), handlers.onClose),
  )
  root.append(actions)

  root.append(
    text(
      doc,
      'trust-note',
      t('comparisonTrustNote'),
    ),
  )

  return root
}

/**
 * Its own stylesheet, in the idiom the other three use.
 *
 * The panel is `position: fixed` and centred, because this surface is a decision
 * point: the user is being asked to leave or to stay, and a corner toast is the
 * wrong shape for that. The tokens come from `OVERLAY_TOKENS`, so there is no
 * second palette here — the last time a surface carried its own hexes, three of
 * them accumulated twenty-two.
 */
function styles(doc: Document): HTMLStyleElement {
  const el = doc.createElement('style')
  el.textContent = `${OVERLAY_TOKENS}
    [data-role=comparison] {
      position: fixed; inset-block-start: 50%; inset-inline-start: 50%;
      transform: translate(-50%, -50%);
      inline-size: min(calc(100vw - var(--ok-space-4) * 2), var(--ok-size-popup));
      padding: var(--ok-space-4);
      border-radius: var(--ok-shape-radius-lg);
      font-family: var(--ok-type-font-family);
      font-size: var(--ok-type-size-sm); line-height: var(--ok-type-line-base);
      color: var(--ok-colour-text); background: var(--ok-colour-surface);
      border: var(--ok-shape-hairline) solid var(--ok-colour-border);
      box-shadow: 0 8px 28px rgb(0 0 0 / 18%);
      z-index: 2147483647;
    }
    h2 {
      margin: 0 0 var(--ok-space-3);
      font-size: var(--ok-type-size-lg); font-weight: var(--ok-type-weight-strong);
    }
    p { margin: 0 0 var(--ok-space-2); }
    code {
      font-family: var(--ok-type-font-mono);
      /* The one thing this surface exists to show, so it is the one thing that
         may not be shrunk: a lookalike is a difference of one character. */
      font-size: var(--ok-type-size-base);
      overflow-wrap: anywhere;
    }
    [data-role=why] { color: var(--ok-colour-text-muted); }
    [data-role=trust-note] {
      margin-block-start: var(--ok-space-3); color: var(--ok-colour-text-muted);
      font-size: var(--ok-type-size-sm);
    }
    [data-role=actions] {
      display: flex; gap: var(--ok-space-2); flex-wrap: wrap;
      margin-block-start: var(--ok-space-3);
    }
    button {
      font: inherit; padding: var(--ok-space-2) var(--ok-space-3);
      border-radius: var(--ok-shape-radius);
      border: var(--ok-shape-hairline) solid var(--ok-colour-border);
      color: var(--ok-colour-text); background: var(--ok-colour-surface-raised);
      cursor: pointer;
    }
    button[data-primary=true] {
      color: var(--ok-colour-accent-text); background: var(--ok-colour-accent);
      border-color: var(--ok-colour-accent);
    }
    button:focus-visible {
      outline: var(--ok-shape-focus-width) solid var(--ok-colour-focus);
      outline-offset: var(--ok-shape-focus-offset);
    }
  `
  return el
}

function row(doc: Document, role: string, label: string, value: string): HTMLElement {
  const el = doc.createElement('p')
  el.setAttribute('data-role', role)
  const name = doc.createElement('span')
  name.textContent = `${label}: `
  const code = doc.createElement('code')
  // Verbatim: a "tidied" rendering of the very thing being compared would
  // defeat the comparison.
  code.textContent = value
  el.append(name, code)
  return el
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
  primary = false,
): HTMLButtonElement {
  const el = doc.createElement('button')
  el.type = 'button'
  el.setAttribute('data-role', role)
  if (primary) el.setAttribute('data-primary', 'true')
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}
