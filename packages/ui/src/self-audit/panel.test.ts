/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest'
import type { AuditEntry } from '@okolos/contracts'

import { renderSelfAudit } from './panel.js'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fromCatalogue, useResolver, type Catalogue } from '@okolos/i18n'

/** The shipped Russian catalogue: `default_locale` is `ru`, and a fake would let a missing key pass. */
const CATALOGUE = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../../../../apps/extension/_locales/ru/messages.json'),
    'utf8',
  ),
) as Catalogue

useResolver(fromCatalogue(CATALOGUE))

/** The entry, or a failure that names the key rather than comparing to undefined. */
function message(key: string): string {
  const entry = CATALOGUE[key]
  if (!entry) throw new Error(`the shipped catalogue has no key "${key}"`)
  return entry.message
}

const handlers = { onExport: vi.fn(), onRepair: vi.fn() }

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'a1',
    createdAt: '2026-08-04T09:00:00.000Z',
    destination: 'api.pwnedpasswords.com',
    purpose: 'password-range',
    payloadShape: 'hash-prefix:5BAA6',
    triggeredBy: 'user:password-check',
    outcome: 'sent',
    ...overrides,
  }
}

describe('an empty log is a sentence, not an empty table', () => {
  it('says plainly that nothing was sent', () => {
    const el = renderSelfAudit(document, { kind: 'empty' }, handlers)
    expect(el.querySelector('[data-role=empty]')?.textContent).toBe(message('auditEmpty'))
    expect(el.querySelector('[data-role=entries]')).toBeNull()
  })
})

describe('a failure never looks like silence', () => {
  const el = renderSelfAudit(document, { kind: 'error', message: 'database locked' }, handlers)

  it('names the failure', () => {
    expect(el.querySelector('[data-role=error]')?.textContent).toContain('database locked')
  })

  it('says explicitly that this is not a claim that nothing was sent', () => {
    // Showing an empty list on a read error would be the one lie this panel
    // cannot afford: the reader would conclude the product sent nothing.
    expect(el.querySelector('[data-role=error-note]')?.textContent).toBe(
      message('auditUnreadNote'),
    )
    expect(el.querySelector('[data-role=entries]')).toBeNull()
  })

  it('offers a way out rather than a dead end', () => {
    expect(el.querySelector('[data-role=repair]')).not.toBeNull()
  })
})

describe('the log itself', () => {
  const entries = [
    entry(),
    entry({ id: 'a2', purpose: 'feed-update', payloadShape: 'chunk-ids:17,18', outcome: 'failed' }),
    entry({ id: 'a3', outcome: 'blocked-by-redactor', payloadShape: 'refused: email in url' }),
  ]
  const el = renderSelfAudit(
    document,
    { kind: 'ready', entries, since: 'Monday' },
    handlers,
  )

  it('summarises what was sent, what failed and what was refused', () => {
    const summary = el.querySelector('[data-role=summary]')?.textContent ?? ''
    expect(summary).toContain(message('auditSummarySent').split('$')[0]?.trim())
    // The counts, and that each category is named at all. The wording of the
    // three phrases is the catalogue's business; that none of them is silently
    // dropped is this test's.
    expect(summary).toContain(message('auditSummaryFailed').split('$')[0]?.trim())
    expect(summary).toContain(message('auditSummaryBlocked').split('$')[0]?.trim())
    expect(summary).toMatch(/1[^\d]*1[^\d]*1/)
  })

  it('states the absence as well as the presence', () => {
    expect(el.querySelector('[data-role=summary]')?.textContent).toContain(
      message('auditSummaryNoContent'),
    )
  })

  it('lists every entry with its destination, purpose and payload shape', () => {
    const rows = el.querySelectorAll('[data-role=entry]')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.querySelector('[data-role=entry-destination]')?.textContent).toBe(
      'api.pwnedpasswords.com',
    )
    expect(rows[0]?.querySelector('[data-role=entry-payload]')?.textContent).toBe(
      'hash-prefix:5BAA6',
    )
  })

  it('explains the purpose in the reader’s words, not in ours', () => {
    expect(el.querySelector('[data-role=entry-purpose]')?.textContent).toBe(
      message('auditPurposePasswordRange'),
    )
  })

  it('offers the export that makes the claim checkable against a network trace', () => {
    expect(el.querySelector('[data-role=export]')).not.toBeNull()
  })
})

describe('loading', () => {
  it('says it is reading rather than showing an empty list', () => {
    const el = renderSelfAudit(document, { kind: 'loading' }, handlers)
    expect(el.querySelector('[data-role=status]')?.textContent).toContain(message('auditReading'))
    expect(el.querySelector('[data-role=entries]')).toBeNull()
  })
})
