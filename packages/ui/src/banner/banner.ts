import { t } from '@okolos/i18n'

import { OVERLAY_TOKENS } from '../overlay-tokens.js'
import { createOverlayHost } from '../host.js'
import type { Severity, VerdictCategory } from '@okolos/contracts'

/**
 * The in-page warning.
 *
 * It renders into a *closed* shadow root: page CSS cannot restyle it, page
 * scripts cannot read or remove it, and nothing of it appears in the page's
 * own document. A hostile page that could hide the warning about itself would
 * make the whole surface pointless.
 *
 * No framework. This code runs inside every page the user opens; a runtime
 * shipped there is weight the user pays for on every navigation and attack
 * surface they did not ask for.
 */

export type BannerVariant = Extract<
  VerdictCategory,
  'injection' | 'lookalike' | 'clickfix' | 'techsupport' | 'download' | 'credential' | 'password'
>

/** Variants that interrupt: the user is mid-way into a trap and one click from harm. */
const BLOCKING: ReadonlySet<BannerVariant> = new Set<BannerVariant>(['clickfix', 'techsupport'])

/**
 * Severity in words, and the words come from the catalogue.
 *
 * The map is over keys rather than sentences because the mapping — which
 * severity gets which label — is a product decision that belongs in code,
 * while the wording is a translation that belongs in `_locales`. Collapsing
 * the two would put Russian copy in a TypeScript file, which is where it
 * stops being translatable.
 */
const SEVERITY_KEY: Record<Severity, string> = {
  critical: 'bannerSeverityCritical',
  major: 'bannerSeverityMajor',
  minor: 'bannerSeverityMinor',
  info: 'bannerSeverityInfo',
}

const PRIMARY_ACTION_KEY: Record<BannerVariant, string> = {
  injection: 'bannerActionInjection',
  lookalike: 'bannerActionLookalike',
  clickfix: 'bannerActionClickfix',
  techsupport: 'bannerActionTechsupport',
  download: 'bannerActionDownload',
  credential: 'bannerActionCredential',
  password: 'bannerActionPassword',
}

export interface BannerProps {
  readonly variant: BannerVariant
  readonly severity: Severity
  /** One sentence, plain language, no jargon and no scare metrics. */
  readonly headline: string
  readonly detail: string
  /** Where the verdict came from — every claim names its source. */
  readonly sourceLine: string
  /**
   * Overrides the variant's default primary label. The default is right until
   * the surface knows better: offering "Discard the file" for a download the
   * browser already cancelled describes an action nobody can take.
   */
  readonly primaryLabel?: string
}

export interface BannerHandlers {
  readonly onPrimary: () => void
  /**
   * The error state's "Try again". Named for what the button is, after a spell
   * called `onInspect` — which read at every call site as if it opened
   * something, and led one surface to hand it a journal it could never show.
   */
  readonly onRetry: () => void
  readonly onDispute: () => void
  readonly onDismiss: () => void
}

export interface BannerHandle {
  readonly host: HTMLElement
  readonly root: ShadowRoot
  showError(message: string): void
  destroy(): void
}

export function mountBanner(
  doc: Document,
  props: BannerProps,
  handlers: BannerHandlers,
): BannerHandle {
  const { host, root } = createOverlayHost(doc, 'banner')
  root.append(styles(doc), panel(doc, props, handlers))
  doc.body.append(host)

  return {
    host,
    root,
    showError(message: string) {
      let slot = root.querySelector('[data-role=error]')
      if (!slot) {
        slot = doc.createElement('p')
        slot.setAttribute('data-role', 'error')
        slot.setAttribute('role', 'status')
        const retry = doc.createElement('button')
        retry.setAttribute('data-role', 'retry')
        retry.textContent = t('bannerRetry')
        retry.addEventListener('click', handlers.onRetry)
        root.querySelector('[data-role=panel]')?.append(slot, retry)
      }
      slot.textContent = message
    },
    destroy() {
      host.remove()
    },
  }
}

function panel(doc: Document, props: BannerProps, handlers: BannerHandlers): HTMLElement {
  const blocking = BLOCKING.has(props.variant)

  const panelEl = doc.createElement('section')
  panelEl.setAttribute('data-role', 'panel')
  panelEl.setAttribute('data-variant', props.variant)
  panelEl.setAttribute('data-blocking', String(blocking))
  panelEl.setAttribute('role', 'alert')
  panelEl.setAttribute('aria-live', 'assertive')
  panelEl.tabIndex = -1

  // Severity is stated in words. Colour alone fails for a colour-blind reader
  // and disappears entirely in high-contrast mode, so it carries emphasis
  // here and never meaning.
  const severity = doc.createElement('span')
  severity.setAttribute('data-role', 'severity')
  severity.textContent = t(SEVERITY_KEY[props.severity])

  const headline = doc.createElement('h2')
  headline.setAttribute('data-role', 'headline')
  headline.textContent = props.headline

  const detail = doc.createElement('p')
  detail.setAttribute('data-role', 'detail')
  detail.textContent = props.detail

  const source = doc.createElement('p')
  source.setAttribute('data-role', 'source')
  source.textContent = props.sourceLine

  const actions = doc.createElement('div')
  actions.setAttribute('data-role', 'actions')
  actions.append(
    button(
      doc,
      'primary',
      props.primaryLabel ?? t(PRIMARY_ACTION_KEY[props.variant]),
      handlers.onPrimary,
      true,
    ),
    button(doc, 'dispute', t('actionDispute'), handlers.onDispute),
  )
  if (!blocking) {
    actions.append(button(doc, 'dismiss', t('bannerDismiss'), handlers.onDismiss))
  }

  panelEl.addEventListener('keydown', (event) => {
    // A blocking warning ignores Escape on purpose: the user is one paste away
    // from running an attacker's command, and a stray keypress must not be the
    // thing that clears the last warning they will get.
    if ((event as KeyboardEvent).key === 'Escape' && !blocking) handlers.onDismiss()
  })

  panelEl.append(severity, headline, detail, source, actions)
  return panelEl
}

function button(
  doc: Document,
  role: string,
  label: string,
  onClick: () => void,
  primary = false,
): HTMLButtonElement {
  const el = doc.createElement('button')
  el.setAttribute('data-role', role)
  if (primary) el.setAttribute('data-primary', 'true')
  el.type = 'button'
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}

function styles(doc: Document): HTMLStyleElement {
  const el = doc.createElement('style')
  el.textContent = `${OVERLAY_TOKENS}
    [data-role=panel] {
      position: fixed;
      inset-block-end: var(--ok-space-4); inset-inline-end: var(--ok-space-4);
      max-inline-size: var(--ok-size-popup); padding: var(--ok-space-4);
      border-radius: var(--ok-shape-radius-lg);
      font-family: var(--ok-type-font-family);
      font-size: var(--ok-type-size-sm); line-height: var(--ok-type-line-base);
      color: var(--ok-colour-text); background: var(--ok-colour-surface);
      border: var(--ok-shape-hairline) solid var(--ok-colour-border);
      /* The one shadow in the product: this panel floats over somebody else's
         page and has to read as separate from it. */
      box-shadow: 0 8px 28px rgb(0 0 0 / 18%);
      z-index: 2147483647;
    }
    [data-role=panel][data-blocking=true] {
      inset: 0; max-inline-size: none; display: grid;
      place-content: center; text-align: center;
      background: var(--ok-colour-surface);
    }
    [data-role=severity] {
      font-weight: var(--ok-type-weight-strong); text-transform: uppercase;
      letter-spacing: .04em; font-size: var(--ok-type-size-sm);
    }
    [data-role=headline] {
      margin: var(--ok-space-1) 0; font-size: var(--ok-type-size-base);
      font-weight: var(--ok-type-weight-strong);
    }
    [data-role=detail], [data-role=source] { margin: 0 0 var(--ok-space-1); }
    [data-role=source] { color: var(--ok-colour-text-muted); font-size: var(--ok-type-size-sm); }
    [data-role=error] { color: var(--ok-colour-severity-block); }
    [data-role=actions] {
      display: flex; gap: var(--ok-space-2);
      margin-block-start: var(--ok-space-3); flex-wrap: wrap;
    }
    button {
      font: inherit; min-block-size: var(--ok-shape-target-min);
      padding: var(--ok-space-1) var(--ok-space-3);
      border-radius: var(--ok-shape-radius);
      border: var(--ok-shape-hairline) solid var(--ok-colour-border-strong);
      background: var(--ok-colour-surface); color: var(--ok-colour-text);
      cursor: pointer;
    }
    button[data-primary=true] {
      background: var(--ok-colour-accent); border-color: var(--ok-colour-accent);
      color: var(--ok-colour-accent-text);
    }
    button:focus-visible {
      outline: var(--ok-shape-focus-width) solid var(--ok-colour-focus);
      outline-offset: var(--ok-shape-focus-offset);
    }
  `
  return el
}
