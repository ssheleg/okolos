import { OVERLAY_TOKENS } from '../overlay-tokens.js'
import { shadowMode } from '../shadow.js'
import type { Confidence, Evidence } from '@okolos/contracts'

/**
 * The finding inspector: the evidence, so the user can judge the verdict
 * instead of trusting it.
 *
 * This surface is why the deterministic stages are allowed to act at all. A
 * score cannot be checked by the person it affects; the text that was hidden,
 * the technique that hid it and the place it sat can be. Everything here is
 * shown verbatim rather than summarised.
 */

/** Signal names as they appear in evidence detail, in words a person can weigh. */
const SIGNAL_WORDING: Record<string, string> = {
  override: 'cancels earlier instructions',
  'role-assignment': 'tells the assistant who it now is',
  vocative: 'addresses an assistant directly',
  secrecy: 'asks the assistant to keep this from you',
  'conditional-identity': 'speaks only to a machine ("if you are an AI…")',
  'tool-invocation': "reaches for the assistant's tools",
  'system-prompt': 'impersonates the system layer',
  'sensitive-target': 'asks for credentials or codes',
  'char-anomaly': 'uses characters invisible to a reader but not to a model',
}

const TECHNIQUE_WORDING: Record<string, string> = {
  'color-on-color': 'same colour as its background',
  'display-none': 'removed from the layout',
  'visibility-hidden': 'made invisible',
  'opacity-zero': 'fully transparent',
  'font-size-zero': 'shrunk to no size',
  clip: 'clipped to nothing',
  offscreen: 'moved off the screen',
  'aria-hidden': 'hidden from assistive technology',
  'non-rendered': 'in a part of the page that never renders',
}

export interface InspectorProps {
  readonly evidence: readonly Evidence[]
  readonly confidence: Confidence
  /**
   * What a restore could not do, in a sentence, or absent when it did.
   *
   * "Restore the page" used to close this panel whatever happened, so a user
   * whose text did not come back saw exactly what a user whose text did. The
   * sanitiser has always known the difference — it reports what it put back,
   * what the page had removed, and what the page had written over — and this
   * is the surface that had nowhere to put it.
   */
  readonly restoreNote?: string
}

export interface InspectorHandlers {
  readonly onKeep: () => void
  readonly onRestore: () => void
  readonly onDispute: () => void
  readonly onClose: () => void
}

export interface InspectorHandle {
  readonly host: HTMLElement
  readonly root: ShadowRoot
  destroy(): void
}

export function mountInspector(
  doc: Document,
  props: InspectorProps,
  handlers: InspectorHandlers,
): InspectorHandle {
  const host = doc.createElement('okolos-inspector')
  host.setAttribute('data-okolos', 'inspector')
  const root = host.attachShadow({ mode: shadowMode() })
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

function panel(doc: Document, props: InspectorProps, handlers: InspectorHandlers): HTMLElement {
  const el = doc.createElement('section')
  el.setAttribute('data-role', 'panel')
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-label', 'What was hidden on this page')
  el.tabIndex = -1

  const title = doc.createElement('h2')
  title.textContent = 'What was hidden on this page'
  el.append(title)

  if (props.evidence.length === 0) {
    // The page mutated out from under the finding. Saying so beats an empty
    // panel, which would read as "there was nothing after all".
    el.append(
      text(doc, 'empty', 'The page changed since this was found, so the evidence is gone.'),
      button(doc, 'rescan', 'Scan again', handlers.onClose),
    )
    return el
  }

  for (const item of props.evidence) {
    el.append(evidenceBlock(doc, item, props.confidence))
  }

  if (props.evidence.some((e) => e.detail.partialScan === true)) {
    el.append(
      text(
        doc,
        'partial',
        'This page was too large to check in full, so there may be more than what is listed here.',
      ),
    )
  }

  if (props.restoreNote) {
    // Above the buttons, not below: the user is about to press one of them
    // again, and what just failed belongs in front of that decision.
    const note = doc.createElement('p')
    note.setAttribute('data-role', 'restore-note')
    note.textContent = props.restoreNote
    el.append(note)
  }

  const actions = doc.createElement('div')
  actions.setAttribute('data-role', 'actions')
  actions.append(
    button(doc, 'keep', 'Keep it neutralised', handlers.onKeep, true),
    button(doc, 'restore', 'Restore the page', handlers.onRestore),
    button(doc, 'dispute', 'This is wrong', handlers.onDispute),
  )
  el.append(actions)

  el.addEventListener('keydown', (event) => {
    // Advisory, not a trap: unlike a ClickFix warning, closing this costs the
    // user nothing they cannot get back.
    if ((event as KeyboardEvent).key === 'Escape') handlers.onClose()
  })

  return el
}

function evidenceBlock(doc: Document, item: Evidence, confidence: Confidence): HTMLElement {
  const block = doc.createElement('article')
  block.setAttribute('data-role', 'item')

  const snippet = doc.createElement('pre')
  snippet.setAttribute('data-role', 'snippet')
  // Verbatim, not summarised: a paraphrase of an injection is not evidence.
  snippet.textContent = item.snippet ?? '(no text captured)'

  const signals = String(item.detail.signals ?? '')
    .split(',')
    .filter(Boolean)
    .map((s) => SIGNAL_WORDING[s] ?? s)
  const concealment = String(item.detail.concealment ?? '')
    .split(',')
    .filter(Boolean)
    .map((c) => TECHNIQUE_WORDING[c] ?? c)

  block.append(
    snippet,
    text(doc, 'why', signals.length > 0 ? `Why it was flagged: ${signals.join('; ')}.` : ''),
    text(doc, 'technique', `How it was hidden: ${concealment.join('; ') || 'not stated'}.`),
    text(doc, 'locator', `Where: ${item.locator ?? 'unknown'}`),
    text(doc, 'stage', `Decided by: ${item.stage} (${confidence} confidence)`),
  )
  return block
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
    [data-role=panel] {
      position: fixed;
      inset-block-end: var(--ok-space-4); inset-inline-end: var(--ok-space-4);
      inline-size: min(520px, calc(100vw - var(--ok-space-6)));
      max-block-size: 70vh; overflow: auto;
      padding: var(--ok-space-4); border-radius: var(--ok-shape-radius-lg);
      background: var(--ok-colour-surface); color: var(--ok-colour-text);
      border: var(--ok-shape-hairline) solid var(--ok-colour-border);
      box-shadow: 0 8px 28px rgb(0 0 0 / 18%);
      font-family: var(--ok-type-font-family);
      font-size: var(--ok-type-size-sm); line-height: var(--ok-type-line-base);
      z-index: 2147483647;
    }
    h2 {
      margin: 0 0 var(--ok-space-2); font-size: var(--ok-type-size-base);
      font-weight: var(--ok-type-weight-strong);
    }
    [data-role=item] {
      padding: var(--ok-space-2) 0;
      border-block-start: var(--ok-shape-hairline) solid var(--ok-colour-border);
    }
    /* The concealed text itself, shown verbatim: monospace so a zero-width
       character has somewhere visible to be. */
    [data-role=snippet] {
      margin: 0 0 var(--ok-space-2); padding: var(--ok-space-2);
      border-radius: var(--ok-shape-radius);
      background: var(--ok-colour-surface-sunken);
      white-space: pre-wrap; overflow-wrap: anywhere;
      font-family: var(--ok-type-font-mono); font-size: var(--ok-type-size-sm);
    }
    [data-role=locator], [data-role=stage] {
      color: var(--ok-colour-text-muted); font-size: var(--ok-type-size-sm);
      margin: 0;
    }
    [data-role=partial], [data-role=restore-note] {
      color: var(--ok-colour-severity-warn); margin: var(--ok-space-2) 0 0;
    }
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
