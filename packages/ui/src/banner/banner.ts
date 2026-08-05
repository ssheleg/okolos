import { shadowMode } from '../shadow.js'
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

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  major: 'Serious',
  minor: 'Minor',
  info: 'For information',
}

const PRIMARY_ACTION: Record<BannerVariant, string> = {
  injection: 'Show me',
  lookalike: 'Show the comparison',
  clickfix: 'Leave this page',
  techsupport: 'Close this page',
  download: 'Discard the file',
  credential: 'Leave this page',
  password: 'Change password',
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
  const host = doc.createElement('okolos-banner')
  host.setAttribute('data-okolos', 'banner')
  const root = host.attachShadow({ mode: shadowMode() })
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
        retry.textContent = 'Try again'
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
  severity.textContent = SEVERITY_LABEL[props.severity]

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
    button(doc, 'primary', props.primaryLabel ?? PRIMARY_ACTION[props.variant], handlers.onPrimary, true),
    button(doc, 'dispute', 'This is wrong', handlers.onDispute),
  )
  if (!blocking) {
    actions.append(button(doc, 'dismiss', 'Dismiss', handlers.onDismiss))
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
  el.textContent = `
    :host { all: initial; }
    [data-role=panel] {
      position: fixed; inset-block-end: 16px; inset-inline-end: 16px;
      max-inline-size: 380px; padding: 16px; border-radius: 12px;
      font: 14px/1.45 system-ui, sans-serif; color: #10161d;
      background: #fff; border: 1px solid #d5dbe3;
      box-shadow: 0 8px 28px rgb(16 22 29 / 18%); z-index: 2147483647;
    }
    [data-role=panel][data-blocking=true] {
      position: fixed; inset: 0; max-inline-size: none; display: grid;
      place-content: center; text-align: center; background: #fffdf7;
    }
    [data-role=severity] { font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 11px; }
    [data-role=headline] { margin: 6px 0 4px; font-size: 15px; font-weight: 650; }
    [data-role=detail], [data-role=source] { margin: 0 0 6px; }
    [data-role=source] { color: #5b6572; font-size: 12px; }
    [data-role=error] { color: #8a2018; }
    [data-role=actions] { display: flex; gap: 8px; margin-block-start: 12px; flex-wrap: wrap; }
    button { font: inherit; padding: 7px 12px; border-radius: 8px; border: 1px solid #d5dbe3; background: #f3f5f8; cursor: pointer; }
    button[data-primary=true] { background: #10161d; border-color: #10161d; color: #fff; }
    button:focus-visible { outline: 2px solid #2b6cb0; outline-offset: 2px; }
    @media (prefers-color-scheme: dark) {
      [data-role=panel] { color: #eef2f6; background: #171c23; border-color: #2b333d; }
      button { background: #222932; border-color: #39424e; color: #eef2f6; }
      button[data-primary=true] { background: #eef2f6; color: #10161d; }
    }
  `
  return el
}
