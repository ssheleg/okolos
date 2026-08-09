
import { t } from '@okolos/i18n'
import type { AuditEntry } from '@okolos/contracts'

/**
 * The self-audit panel: what left this device, and why.
 *
 * This surface is the product's central claim made checkable. Everything here
 * is read from the same journal the network layer writes to before it sends,
 * so the panel cannot show a rosier picture than reality — and the export
 * exists so the user can diff it against a browser network trace rather than
 * taking our word for it.
 */

export type PanelState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly entries: readonly AuditEntry[]; readonly since: string }

export interface PanelHandlers {
  readonly onExport: () => void
  readonly onRepair: () => void
}

export function renderSelfAudit(
  doc: Document,
  state: PanelState,
  handlers: PanelHandlers,
): HTMLElement {
  const section = doc.createElement('section')
  section.setAttribute('data-role', 'self-audit')
  section.setAttribute('data-state', state.kind)

  const heading = doc.createElement('h1')
  heading.textContent = t('auditHeading')
  section.append(heading)

  switch (state.kind) {
    case 'loading':
      section.append(text(doc, 'status', t('auditReading')))
      return section

    case 'empty':
      // An empty table is a claim the reader has to interpret. A sentence is
      // the claim itself, and it is the one people install this product for.
      section.append(text(doc, 'empty', t('auditEmpty')))
      return section

    case 'error': {
      // Never an empty list on failure: silence would read as "nothing was
      // sent", which is precisely the lie this panel exists to prevent.
      section.append(
        text(doc, 'error', t('auditUnread', state.message)),
        text(doc, 'error-note', t('auditUnreadNote')),
        action(doc, 'repair', t('auditRepair'), handlers.onRepair),
      )
      return section
    }

    case 'ready': {
      section.append(text(doc, 'summary', summarise(state.entries, state.since)))
      const list = doc.createElement('ol')
      list.setAttribute('data-role', 'entries')
      for (const entry of state.entries) list.append(row(doc, entry))
      section.append(list, action(doc, 'export', t('auditExport'), handlers.onExport))
      return section
    }
  }
}

/**
 * The summary states what is absent as well as what is present. "12 requests"
 * invites the reader to wonder what was in them; naming that none carried a
 * page address or an identifier answers the question they actually have.
 */
function summarise(entries: readonly AuditEntry[], since: string): string {
  const sent = entries.filter((e) => e.outcome === 'sent').length
  const blocked = entries.filter((e) => e.outcome === 'blocked-by-redactor').length
  const failed = entries.filter((e) => e.outcome === 'failed').length

  const parts = [t('auditSummarySent', String(sent), since)]
  if (failed > 0) parts.push(t('auditSummaryFailed', String(failed)))
  if (blocked > 0) parts.push(t('auditSummaryBlocked', String(blocked)))
  parts.push(t('auditSummaryNoContent'))
  return `${parts.join(' · ')}.`
}

function row(doc: Document, entry: AuditEntry): HTMLLIElement {
  const item = doc.createElement('li')
  item.setAttribute('data-role', 'entry')
  item.setAttribute('data-outcome', entry.outcome)
  item.append(
    text(doc, 'entry-time', entry.createdAt),
    text(doc, 'entry-destination', entry.destination),
    // The purpose id is the fallback on purpose: a destination this build does
    // not have wording for is still shown, named as the contract names it,
    // rather than vanishing from the log that exists to be complete.
    text(doc, 'entry-purpose', purposeKey(entry.purpose) ? t(purposeKey(entry.purpose) as string) : entry.purpose),
    // Translated on read, never on write. `payloadShape` is stored in the audit
    // log, and a log written in whatever language was active that day stops
    // being one record. Only the bare "none" is prose; `email:…` and
    // `hash-prefix:…` are shapes, and shapes are the same in every language.
    text(
      doc,
      'entry-payload',
      entry.payloadShape === 'none' ? t('auditPayloadNone') : entry.payloadShape,
    ),
    text(doc, 'entry-trigger', t('auditTriggeredBy', entry.triggeredBy)),
  )
  return item
}

/** Keys, not sentences: a table of words built at module load resolves before
 * `useResolver` runs and freezes the fallback into every screen. */
const PURPOSE_KEY: Record<string, string> = {
  'feed-update': 'auditPurposeFeedUpdate',
  'model-update': 'auditPurposeModelUpdate',
  'password-range': 'auditPurposePasswordRange',
  'leak-lookup': 'auditPurposeLeakLookup',
  'file-hash': 'auditPurposeFileHash',
  'domain-status': 'auditPurposeDomainStatus',
}

const purposeKey = (purpose: string): string | undefined => PURPOSE_KEY[purpose]

function text(doc: Document, role: string, content: string): HTMLParagraphElement {
  const el = doc.createElement('p')
  el.setAttribute('data-role', role)
  el.textContent = content
  return el
}

function action(
  doc: Document,
  role: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const el = doc.createElement('button')
  el.setAttribute('data-role', role)
  el.type = 'button'
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}
