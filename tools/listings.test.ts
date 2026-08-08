/**
 * Publishing a feed must also answer for it.
 *
 * `feeds` holds what the extension downloads and blocks on. `listings` holds
 * what the public status page answers from. They were written independently and
 * nothing kept them in agreement: on 2026-08-08 the worker served a signed feed
 * listing four domains and answered "nothing is recorded for this domain" about
 * every one of them. An owner arriving from the interstitial — the one person
 * the page exists for — was told the block was not coming from here, while
 * their visitors kept being turned away.
 *
 * So the publish path writes both, from the same signed body, in one step.
 */

import { describe, expect, it } from 'vitest'

// @ts-expect-error — a plain .mjs tool, imported for its pure half.
import { hostOf, listingSql } from './listings.mjs'

const AT = '2026-08-08T10:00:00.000Z'

const snapshot = (entries: string[], name = 'phishing') => ({
  kind: 'snapshot' as const,
  body: { name, version: 3, updatedAt: AT, entries },
})

const delta = (added: string[], removed: string[], name = 'phishing') => ({
  kind: 'delta' as const,
  body: { name, base: 2, version: 3, updatedAt: AT, added, removed },
})

describe('the domain a feed entry is about', () => {
  it('is the host, not the path the entry narrows to', () => {
    // A feed may list `evil.test/login` — the block is path-scoped, but the
    // owner asking about their site asks about the host.
    expect(hostOf('evil.test/login')).toBe('evil.test')
    expect(hostOf('evil.test')).toBe('evil.test')
  })

  it('is lower-cased and stripped of a trailing dot, like every other lookup here', () => {
    expect(hostOf('Evil.Test.')).toBe('evil.test')
  })

  it('is null for something that is not a host, rather than a row nobody can act on', () => {
    for (const junk of ['', '..', 'localhost', '/login', 'not a domain']) {
      expect(hostOf(junk), junk).toBeNull()
    }
  })
})

describe('a snapshot publishes the whole answer', () => {
  it('lists every entry under the feed that carries it', () => {
    const sql = listingSql(snapshot(['a.test', 'b.test']), AT)
    expect(sql).toContain("('a.test','phishing'")
    expect(sql).toContain("('b.test','phishing'")
  })

  it('drops what the feed no longer carries', () => {
    // Without this a delisted domain stays listed forever, and the page tells
    // an owner they are blocked when they are not — the same lie, reversed.
    const sql = listingSql(snapshot(['a.test']), AT)
    expect(sql).toMatch(/DELETE FROM listings\s+WHERE feed = 'phishing'/)
    expect(sql).toMatch(/domain NOT IN \('a\.test'\)/)
  })

  it('touches only its own feed, never another publisher\'s rows', () => {
    const sql = listingSql(snapshot(['a.test'], 'openphish'), AT)
    expect(sql).toContain("WHERE feed = 'openphish'")
    expect(sql).not.toContain("'phishing'")
  })

  it('records a date, not an instant — it is what an owner quotes', () => {
    // "recorded 2026-08-08T07:33:50.218Z" is machine output shown to a site
    // owner. We know the day a listing appeared, not the millisecond, and the
    // scenario promises an entry date.
    const sql = listingSql(snapshot(['a.test']), AT)
    expect(sql).toContain("'2026-08-08'")
    expect(sql).not.toContain(AT)
  })

  it('corrects rows that already hold an instant, since the column holds a date', () => {
    // Four live rows were written with a full ISO timestamp before this rule
    // existed. The invariant belongs where the table is written, so every
    // publish repairs them; running it again changes nothing.
    const sql = listingSql(snapshot(['a.test']), AT)
    expect(sql).toMatch(
      /UPDATE listings SET entry_date = substr\(entry_date, 1, 10\) WHERE length\(entry_date\) > 10;/,
    )
  })

  it('keeps the date a domain was first listed, not the date of the latest publish', () => {
    // "Entry dated 2026-06-02" is what an owner quotes. Rewriting it on every
    // republish makes every listing look brand new and un-appealable.
    const sql = listingSql(snapshot(['a.test']), AT)
    expect(sql).toMatch(/ON CONFLICT\(domain\) DO UPDATE SET feed = excluded\.feed/)
    expect(sql).not.toMatch(/DO UPDATE SET[^;]*entry_date/)
  })

  it('publishes an empty feed as an empty feed, not as a no-op', () => {
    const sql = listingSql(snapshot([]), AT)
    expect(sql).toMatch(/DELETE FROM listings\s+WHERE feed = 'phishing'/)
    expect(sql).not.toContain('INSERT INTO listings')
  })
})

describe('a delta publishes only what it changes', () => {
  it('adds what it added and removes what it removed', () => {
    const sql = listingSql(delta(['new.test'], ['gone.test']), AT)
    expect(sql).toContain("('new.test','phishing'")
    expect(sql).toMatch(/DELETE FROM listings WHERE feed = 'phishing' AND domain IN \('gone\.test'\)/)
  })

  it('never sweeps the rows it says nothing about', () => {
    // A delta is not a statement about the rest of the feed. Treating it as one
    // would un-list every domain the delta happens not to mention.
    const sql = listingSql(delta(['new.test'], []), AT)
    expect(sql).not.toContain('NOT IN')
  })
})

describe('what a feed cannot smuggle into the database', () => {
  it('refuses an entry that is not a host rather than storing it', () => {
    expect(() => listingSql(snapshot(['a.test', 'not a domain']), AT)).toThrow(/not a domain/)
  })

  it('refuses a quote in a feed name instead of ending the statement early', () => {
    // The body is signed, so this is not an attacker's path — it is a
    // publishing mistake, and it should stop at the tool rather than arrive as
    // a half-executed migration.
    expect(() => listingSql(snapshot(['a.test'], "phish'ing"), AT)).toThrow(/feed name/)
  })
})
