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
  el.setAttribute('aria-label', 'An action was held for your decision')
  el.tabIndex = -1

  const title = doc.createElement('h2')
  title.textContent = 'Something tried to act on this page'
  el.append(title)

  el.append(text(doc, 'action', `Attempted: ${props.action}`))
  if (props.target) el.append(text(doc, 'target', `Where: ${props.target}`))

  if (props.findings.length === 0) {
    // Holding an action and then failing to say why is the worst of both: the
    // user is interrupted and none the wiser.
    el.append(text(doc, 'finding', 'This page has an unresolved finding that could not be described.'))
  } else {
    for (const finding of props.findings) el.append(text(doc, 'finding', finding))
  }

  el.append(
    text(
      doc,
      'timeout',
      `If you do not answer within ${props.timeoutSeconds} seconds, the action is blocked.`,
    ),
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
    button(doc, 'block', 'Block', once(handlers.onBlock), true),
    button(doc, 'allow', 'Allow once', once(handlers.onAllowOnce)),
    button(doc, 'show', 'Show the injection', handlers.onShowInjection),
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
  el.textContent = `
    :host { all: initial; }
    [data-role=scrim] {
      position: fixed; inset: 0; background: rgb(16 22 29 / 55%); z-index: 2147483646;
    }
    [data-role=dialog] {
      position: fixed; inset-block-start: 50%; inset-inline-start: 50%;
      transform: translate(-50%, -50%);
      inline-size: min(480px, calc(100vw - 32px)); max-block-size: 80vh; overflow: auto;
      padding: 20px; border-radius: 12px; background: #fff; color: #10161d;
      border: 1px solid #d5dbe3; box-shadow: 0 12px 40px rgb(16 22 29 / 28%);
      font: 14px/1.45 system-ui, sans-serif; z-index: 2147483647;
    }
    h2 { margin: 0 0 12px; font-size: 16px; }
    [data-role=action] { font-weight: 600; }
    [data-role=target] { color: #5b6572; overflow-wrap: anywhere; }
    [data-role=finding] {
      margin: 10px 0; padding: 10px; border-radius: 8px; background: #fdf3f3;
      border: 1px solid #f0d4d4;
    }
    [data-role=timeout] { color: #5b6572; font-size: 12px; }
    [data-role=actions] { display: flex; gap: 8px; margin-block-start: 16px; flex-wrap: wrap; }
    button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid #d5dbe3; background: #f3f5f8; cursor: pointer; }
    button[data-primary=true] { background: #a1231f; border-color: #a1231f; color: #fff; }
    button:focus-visible { outline: 2px solid #2b6cb0; outline-offset: 2px; }
    @media (prefers-color-scheme: dark) {
      [data-role=dialog] { background: #171c23; color: #eef2f6; border-color: #2b333d; }
      [data-role=finding] { background: #241618; border-color: #46262a; }
      button { background: #222932; border-color: #39424e; color: #eef2f6; }
      button[data-primary=true] { background: #c2312c; border-color: #c2312c; color: #fff; }
    }
  `
  return el
}
