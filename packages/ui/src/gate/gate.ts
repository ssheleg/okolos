import { t } from '@okolos/i18n'

import { OVERLAY_TOKENS } from '../overlay-tokens.js'
import { shadowMode } from '../shadow.js'

/**
 * SCR-06 — the agent action gate.
 *
 * Every other surface in this product is advisory: a banner you can ignore, a
 * panel you can close. This one interrupts, because it stands between a page
 * that carries an instruction for a machine and a machine about to act on it.
 *
 * Block is the default in every sense that can be arranged: it is the primary
 * button, it holds focus so a stray Enter blocks rather than allows, Escape
 * chooses it, and the notice says plainly that doing nothing blocks too. The
 * one path to "allow" is a person deliberately clicking it.
 */

export interface GateProps {
  /** One sentence naming what is about to happen. */
  readonly action: string
  /** Where it was going — origin and path only. */
  readonly target?: string
  /** One line per unresolved finding, as the user would read it. */
  readonly findings: readonly string[]
  readonly timeoutSeconds: number
}

export interface GateHandlers {
  readonly onBlock: () => void
  readonly onAllowOnce: () => void
  readonly onShowInjection: () => void
}

export interface GateHandle {
  readonly host: HTMLElement
  readonly root: ShadowRoot
  destroy(): void
}

export function mountGate(doc: Document, props: GateProps, handlers: GateHandlers): GateHandle {
  const host = doc.createElement('okolos-gate')
  host.setAttribute('data-okolos', 'gate')
  const root = host.attachShadow({ mode: shadowMode() })
  root.append(styles(doc), scrim(doc), dialog(doc, props, handlers))
  doc.body.append(host)

  const block = root.querySelector<HTMLButtonElement>('[data-role=block]')
  block?.focus()

  return {
    host,
    root,
    destroy() {
      host.remove()
    },
  }
}

function scrim(doc: Document): HTMLElement {
  const el = doc.createElement('div')
  el.setAttribute('data-role', 'scrim')
  return el
}

function dialog(doc: Document, props: GateProps, handlers: GateHandlers): HTMLElement {
  const el = doc.createElement('section')
  el.setAttribute('data-role', 'dialog')
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-modal', 'true')
  el.setAttribute('aria-label', t('gateAriaLabel'))
  el.tabIndex = -1

  const title = doc.createElement('h2')
  title.textContent = t('gateTitle')
  el.append(title)

  el.append(text(doc, 'action', t('gateAction', props.action)))
  if (props.target) el.append(text(doc, 'target', t('gateTarget', props.target)))

  if (props.findings.length === 0) {
    // Holding an action and then failing to say why is the worst of both: the
    // user is interrupted and none the wiser.
    el.append(text(doc, 'finding', t('gateFindingUnknown')))
  } else {
    for (const finding of props.findings) el.append(text(doc, 'finding', finding))
  }

  el.append(
    text(doc, 'timeout', t('gateTimeoutNote', String(props.timeoutSeconds))),
  )

  // One decision per gate. A second click after the surface has been answered
  // must not fire a second, contradicting outcome.
  let settled = false
  const once = (fn: () => void) => () => {
    if (settled) return
    settled = true
    fn()
  }

  const actions = doc.createElement('div')
  actions.setAttribute('data-role', 'actions')
  actions.append(
    button(doc, 'block', t('gateBlock'), once(handlers.onBlock), true),
    button(doc, 'allow', t('gateAllowOnce'), once(handlers.onAllowOnce)),
    button(doc, 'show', t('gateShow'), handlers.onShowInjection),
  )
  el.append(actions)

  el.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape') once(handlers.onBlock)()
  })

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
    [data-role=scrim] {
      position: fixed; inset: 0; background: rgb(0 0 0 / 55%); z-index: 2147483646;
    }
    [data-role=dialog] {
      position: fixed; inset-block-start: 50%; inset-inline-start: 50%;
      transform: translate(-50%, -50%);
      inline-size: min(480px, calc(100vw - var(--ok-space-6)));
      max-block-size: 80vh; overflow: auto;
      padding: var(--ok-space-5); border-radius: var(--ok-shape-radius-lg);
      background: var(--ok-colour-surface); color: var(--ok-colour-text);
      border: var(--ok-shape-hairline) solid var(--ok-colour-border);
      box-shadow: 0 12px 40px rgb(0 0 0 / 28%);
      font-family: var(--ok-type-font-family);
      font-size: var(--ok-type-size-sm); line-height: var(--ok-type-line-base);
      z-index: 2147483647;
    }
    h2 {
      margin: 0 0 var(--ok-space-3); font-size: var(--ok-type-size-lg);
      font-weight: var(--ok-type-weight-strong);
    }
    [data-role=action] { font-weight: var(--ok-type-weight-strong); }
    [data-role=target] { color: var(--ok-colour-text-muted); overflow-wrap: anywhere; }
    /*
     * The finding is marked by a bar, not a fill. A tinted panel was the only
     * place in this product where colour carried a meaning on its own; the bar
     * sits beside the text that already says it.
     */
    [data-role=finding] {
      margin: var(--ok-space-2) 0; padding: var(--ok-space-2) var(--ok-space-3);
      border-inline-start: var(--ok-shape-severity-bar) solid var(--ok-colour-severity-block);
      background: var(--ok-colour-surface-sunken);
      border-radius: var(--ok-shape-radius);
    }
    [data-role=timeout] { color: var(--ok-colour-text-muted); font-size: var(--ok-type-size-sm); }
    [data-role=actions] {
      display: flex; gap: var(--ok-space-2);
      margin-block-start: var(--ok-space-4); flex-wrap: wrap;
    }
    button {
      font: inherit; min-block-size: var(--ok-shape-target-min);
      padding: var(--ok-space-1) var(--ok-space-3);
      border-radius: var(--ok-shape-radius);
      border: var(--ok-shape-hairline) solid var(--ok-colour-border-strong);
      background: var(--ok-colour-surface); color: var(--ok-colour-text);
      cursor: pointer;
    }
    /* Block is the default here, and the default is not an alarm. */
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
