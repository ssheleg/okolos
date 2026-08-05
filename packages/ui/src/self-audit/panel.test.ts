/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest'
import type { AuditEntry } from '@okolos/contracts'

import { renderSelfAudit } from './panel.js'

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
    expect(el.querySelector('[data-role=empty]')?.textContent).toBe(
      'Nothing has been sent from this device.',
    )
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
    expect(el.querySelector('[data-role=error-note]')?.textContent).toContain(
      'not a statement that nothing was sent',
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
    expect(summary).toContain('1 request sent since Monday')
    expect(summary).toContain('1 failed')
    expect(summary).toContain('1 refused before sending')
  })

  it('states the absence as well as the presence', () => {
    expect(el.querySelector('[data-role=summary]')?.textContent).toContain(
      'none contained a page address, an email or page content',
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
      'checking a password against known leaks',
    )
  })

  it('offers the export that makes the claim checkable against a network trace', () => {
    expect(el.querySelector('[data-role=export]')).not.toBeNull()
  })
})

describe('loading', () => {
  it('says it is reading rather than showing an empty list', () => {
    const el = renderSelfAudit(document, { kind: 'loading' }, handlers)
    expect(el.querySelector('[data-role=status]')?.textContent).toContain('Reading the log')
    expect(el.querySelector('[data-role=entries]')).toBeNull()
  })
})
