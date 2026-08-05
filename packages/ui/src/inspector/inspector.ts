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
  const root = host.attachShadow({ mode: 'closed' })
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
  el.textContent = `
    :host { all: initial; }
    [data-role=panel] {
      position: fixed; inset-block-end: 16px; inset-inline-end: 16px;
      inline-size: min(520px, calc(100vw - 32px)); max-block-size: 70vh; overflow: auto;
      padding: 16px; border-radius: 12px; background: #fff; color: #10161d;
      border: 1px solid #d5dbe3; box-shadow: 0 8px 28px rgb(16 22 29 / 18%);
      font: 14px/1.45 system-ui, sans-serif; z-index: 2147483647;
    }
    h2 { margin: 0 0 10px; font-size: 15px; }
    [data-role=item] { padding: 10px 0; border-block-start: 1px solid #e6eaef; }
    [data-role=snippet] {
      margin: 0 0 8px; padding: 10px; border-radius: 8px; background: #f3f5f8;
      white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.5 ui-monospace, monospace;
    }
    [data-role=locator], [data-role=stage] { color: #5b6572; font-size: 12px; margin: 2px 0; }
    [data-role=partial] { color: #7a5a12; }
    [data-role=actions] { display: flex; gap: 8px; margin-block-start: 12px; flex-wrap: wrap; }
    button { font: inherit; padding: 7px 12px; border-radius: 8px; border: 1px solid #d5dbe3; background: #f3f5f8; cursor: pointer; }
    button[data-primary=true] { background: #10161d; border-color: #10161d; color: #fff; }
    button:focus-visible { outline: 2px solid #2b6cb0; outline-offset: 2px; }
    @media (prefers-color-scheme: dark) {
      [data-role=panel] { background: #171c23; color: #eef2f6; border-color: #2b333d; }
      [data-role=snippet] { background: #10151b; }
      button { background: #222932; border-color: #39424e; color: #eef2f6; }
      button[data-primary=true] { background: #eef2f6; color: #10161d; }
    }
  `
  return el
}
