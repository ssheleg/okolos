import { describe, expect, it } from 'vitest'
import type { FindingRecord, JournalRecord } from '@okolos/storage'
import type { Verdict } from '@okolos/contracts'

import { buildPopupState, mapJournal, subjectOf, toQueueItems } from './state.js'

const URL_A = 'https://example.test/article'

function verdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    id: 'v1',
    subject: { kind: 'page', ref: URL_A },
    category: 'injection',
    severity: 'major',
    confidence: 'high',
    evidence: [
      {
        kind: 'hidden-text',
        stage: 'rules',
        locator: 'div',
        snippet: 'Ignore all previous instructions',
        detail: {},
      },
    ],
    action: 'sanitize',
    sources: [{ name: 'stage:rules', version: '1', updatedAt: '2026-08-05T00:00:00Z' }],
    createdAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  }
}

function finding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: 'f1',
    createdAt: '2026-08-05T00:00:00.000Z',
    subject: 'page:https://example.test/article',
    resolvedAt: null,
    verdict: verdict(),
    ...overrides,
  }
}

function inputs(overrides: Partial<Parameters<typeof buildPopupState>[0]> = {}) {
  return {
    findings: [] as FindingRecord[],
    journal: [] as JournalRecord[],
    activeUrl: URL_A,
    lastCheck: '2026-08-04T00:00:00.000Z',
    expanded: false,
    ...overrides,
  }
}

describe('what the popup may say about this page', () => {
  it('calls a page clean only when it knows which page it is and found nothing', () => {
    const state = buildPopupState(inputs())
    expect(state).toMatchObject({ page: { verdict: 'clean' } })
  })

  it('will not call a page clean when it cannot tell which page it is', () => {
    // "Nothing needs you" is the most damaging sentence here to say wrongly.
    const state = buildPopupState(inputs({ activeUrl: null }))
    expect(state).toMatchObject({ page: { verdict: 'unknown' } })
  })

  it('treats an internal page the same way rather than vouching for it', () => {
    const state = buildPopupState(inputs({ activeUrl: 'chrome://settings' }))
    expect(state).toMatchObject({ page: { verdict: 'unknown' } })
  })

  it('reports a finding on the page in front of the user', () => {
    const state = buildPopupState(inputs({ findings: [finding()] }))
    expect(state).toMatchObject({ page: { verdict: 'finding' } })
  })

  it('does not blame this page for a finding on another one', () => {
    const elsewhere = finding({ subject: 'page:https://other.test/x' })
    const state = buildPopupState(inputs({ findings: [elsewhere] }))
    expect(state).toMatchObject({ page: { verdict: 'clean' } })
  })

  it('ignores the query string when matching, as the background does', () => {
    const state = buildPopupState(inputs({ activeUrl: `${URL_A}?utm=1`, findings: [finding()] }))
    expect(state).toMatchObject({ page: { verdict: 'finding' } })
  })
})

describe('the queue', () => {
  it('holds only what is unresolved', () => {
    const items = toQueueItems([
      finding({ id: 'open' }),
      finding({ id: 'done', resolvedAt: '2026-08-05T01:00:00.000Z' }),
    ])
    expect(items.map((item) => item.id)).toEqual(['open'])
  })

  it('shows three at a time until asked for all of them', () => {
    const findings = Array.from({ length: 6 }, (_, index) => finding({ id: `f${index}` }))
    expect(buildPopupState(inputs({ findings })).queue.shown).toHaveLength(3)
    expect(buildPopupState(inputs({ findings, expanded: true })).queue.shown).toHaveLength(6)
  })

  it('says what it is holding back', () => {
    const findings = Array.from({ length: 6 }, (_, index) => finding({ id: `f${index}` }))
    expect(buildPopupState(inputs({ findings })).queue.hidden).toBe(3)
  })

  it('drops to severity-only ranking when a finding has no verdict to read', () => {
    const bare: FindingRecord = {
      id: 'f9',
      createdAt: '2026-08-05T00:00:00.000Z',
      subject: 'page:https://example.test/x',
      resolvedAt: null,
    }
    expect(buildPopupState(inputs({ findings: [bare] })).queue.rankedBy).toBe('severity-only')
  })
})

describe('reading the journal', () => {
  const record = (overrides: Partial<JournalRecord> = {}): JournalRecord => ({
    id: 'j1',
    createdAt: '2026-08-05T09:00:00.000Z',
    kind: 'action',
    detail: { explain: 'Blocked: you stopped "Submit the form".', reason: 'user-blocked' },
    ...overrides,
  })

  it('uses the sentence the writer already wrote', () => {
    expect(mapJournal([record()]).entries[0]?.summary).toContain('you stopped')
  })

  it('separates what the user decided from what the product decided', () => {
    expect(mapJournal([record()]).entries[0]?.automatic).toBe(false)
    expect(mapJournal([record({ detail: { reason: 'timeout' } })]).entries[0]?.automatic).toBe(true)
  })

  it('counts a record it cannot read instead of dropping it silently', () => {
    const broken = { id: 'j2' } as unknown as JournalRecord
    const mapped = mapJournal([record(), broken])
    expect(mapped.entries).toHaveLength(1)
    expect(mapped.unreadable).toBe(1)
  })

  it('counts only what is newer than the last check', () => {
    const state = buildPopupState(
      inputs({
        journal: [
          record({ id: 'old', createdAt: '2026-08-03T00:00:00.000Z' }),
          record({ id: 'new', createdAt: '2026-08-05T00:00:00.000Z' }),
        ],
      }),
    )
    expect(state).toMatchObject({ changed: 1 })
  })
})

describe('subject keys', () => {
  it('match the background’s format exactly', () => {
    expect(subjectOf('https://example.test/a/b?q=1#x')).toBe('page:https://example.test/a/b')
  })

  it('refuse anything that is not a web page', () => {
    expect(subjectOf('about:blank')).toBeNull()
    expect(subjectOf('not a url')).toBeNull()
  })
})

describe('"not now" survives the popup closing', () => {
  it('ranks a deferred finding last', () => {
    const findings = [finding({ id: 'deferred' }), finding({ id: 'ordinary' })]
    const state = buildPopupState(
      inputs({
        findings,
        deferrals: new Map([['deferred', '2026-08-06T12:00:00.000Z']]),
        now: '2026-08-05T12:00:00.000Z',
      }),
    )
    expect(state.queue.shown[0]?.id).toBe('ordinary')
  })

  it('brings it back when its time is up', () => {
    const state = buildPopupState(
      inputs({
        findings: [finding({ id: 'deferred' })],
        deferrals: new Map([['deferred', '2026-08-04T12:00:00.000Z']]),
        now: '2026-08-05T12:00:00.000Z',
      }),
    )
    expect(state.queue.shown[0]?.id).toBe('deferred')
  })

  it('still counts it, because deferring is not resolving', () => {
    // A "not now" that removed the item would be a dismissal the user never
    // asked for.
    const state = buildPopupState(
      inputs({
        findings: [finding({ id: 'deferred' })],
        deferrals: new Map([['deferred', '2026-08-06T12:00:00.000Z']]),
        now: '2026-08-05T12:00:00.000Z',
      }),
    )
    expect(state.queue.shown).toHaveLength(1)
  })
})
