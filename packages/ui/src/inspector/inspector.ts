import { t } from '@okolos/i18n'

import { OVERLAY_TOKENS } from '../overlay-tokens.js'
import { createOverlayHost } from '../host.js'
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

/**
 * Signal and technique names, as keys rather than sentences.
 *
 * A signal id is a contract between the detectors and this panel; the sentence
 * a person reads is a translation. Keeping ids here and words in `_locales`
 * means adding a language never touches this file, and an id with no wording
 * still falls back to the id — visible, which is the point.
 */
const SIGNAL_KEY: Record<string, string> = {
  override: 'signalOverride',
  'role-assignment': 'signalRoleAssignment',
  vocative: 'signalVocative',
  secrecy: 'signalSecrecy',
  'conditional-identity': 'signalConditionalIdentity',
  'tool-invocation': 'signalToolInvocation',
  'system-prompt': 'signalSystemPrompt',
  'sensitive-target': 'signalSensitiveTarget',
  'char-anomaly': 'signalCharAnomaly',
}

const TECHNIQUE_KEY: Record<string, string> = {
  'color-on-color': 'techniqueColorOnColor',
  'display-none': 'techniqueDisplayNone',
  'visibility-hidden': 'techniqueVisibilityHidden',
  'opacity-zero': 'techniqueOpacityZero',
  'font-size-zero': 'techniqueFontSizeZero',
  clip: 'techniqueClip',
  offscreen: 'techniqueOffscreen',
  'aria-hidden': 'techniqueAriaHidden',
  'non-rendered': 'techniqueNonRendered',
}

/**
 * Which stage decided, and how sure it was.
 *
 * These were rendered raw — "Decided by: rules (high confidence)" — in a
 * product whose default locale is Russian. An enum value on screen is an
 * identifier shown instead of a name, which the brand pack forbids by name.
 */
const STAGE_KEY: Record<string, string> = {
  diff: 'stageDiff',
  rules: 'stageRules',
  model: 'stageModel',
  feed: 'stageFeed',
  inventory: 'stageInventory',
  corpus: 'stageCorpus',
}

const CONFIDENCE_KEY: Record<Confidence, string> = {
  certain: 'confidenceCertain',
  high: 'confidenceHigh',
  medium: 'confidenceMedium',
  low: 'confidenceLow',
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
  const { host, root } = createOverlayHost(doc, 'inspector')
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
  el.setAttribute('aria-label', t('inspectorTitle'))
  el.tabIndex = -1

  const title = doc.createElement('h2')
  title.textContent = t('inspectorTitle')
  el.append(title)

  if (props.evidence.length === 0) {
    // The page mutated out from under the finding. Saying so beats an empty
    // panel, which would read as "there was nothing after all".
    el.append(
      text(doc, 'empty', t('inspectorEmpty')),
      button(doc, 'rescan', t('inspectorRescan'), handlers.onClose),
    )
    return el
  }

  for (const item of props.evidence) {
    el.append(evidenceBlock(doc, item, props.confidence))
  }

  if (props.evidence.some((e) => e.detail.partialScan === true)) {
    el.append(
      text(doc, 'partial', t('inspectorPartial')),
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
    button(doc, 'keep', t('inspectorKeep'), handlers.onKeep, true),
    button(doc, 'restore', t('inspectorRestore'), handlers.onRestore),
    button(doc, 'dispute', t('actionDispute'), handlers.onDispute),
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
  snippet.textContent = item.snippet ?? t('inspectorNoText')

  const signals = String(item.detail.signals ?? '')
    .split(',')
    .filter(Boolean)
    .map((signal) => (SIGNAL_KEY[signal] ? t(SIGNAL_KEY[signal] as string) : signal))
  const concealment = String(item.detail.concealment ?? '')
    .split(',')
    .filter(Boolean)
    .map((how) => (TECHNIQUE_KEY[how] ? t(TECHNIQUE_KEY[how] as string) : how))

  block.append(
    snippet,
    text(doc, 'why', signals.length > 0 ? t('inspectorWhy', signals.join('; ')) : ''),
    text(
      doc,
      'technique',
      t('inspectorTechnique', concealment.join('; ') || t('inspectorTechniqueUnknown')),
    ),
    text(doc, 'locator', t('inspectorLocator', item.locator ?? t('inspectorLocatorUnknown'))),
    text(
      doc,
      'stage',
      t('inspectorStage', t(STAGE_KEY[item.stage] ?? item.stage), t(CONFIDENCE_KEY[confidence])),
    ),
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
