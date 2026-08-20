import { describe, expect, it } from 'vitest'

import { guardCredentialEntry, type CredentialContext } from './guard.js'

const NOW = '2026-08-05T12:00:00.000Z'

function ctx(overrides: Partial<CredentialContext> = {}): CredentialContext {
  return {
    host: 'shop.test',
    trusted: false,
    firstSeen: '2026-01-01T00:00:00.000Z',
    secure: true,
    postsTo: null,
    resembles: null,
    now: NOW,
    ...overrides,
  }
}

describe('when it stays quiet', () => {
  it('on a site the user has said is fine', () => {
    expect(guardCredentialEntry(ctx({ trusted: true, secure: false }))).toBeNull()
  })

  it('on an encrypted site this device has known for months', () => {
    // A person mid-login on a site they use daily does not need a lecture.
    expect(guardCredentialEntry(ctx())).toBeNull()
  })
})

describe('when it speaks', () => {
  it('on an unencrypted page, because that is a fact and not a guess', () => {
    const warning = guardCredentialEntry(ctx({ secure: false }))
    expect(warning?.severity).toBe('critical')
    expect(warning?.facts[0]).toEqual({ code: 'not-encrypted' })
  })

  it('when the address imitates one the user trusts', () => {
    const warning = guardCredentialEntry(ctx({ resembles: 'paypal.com' }))
    expect(warning?.severity).toBe('critical')
    expect(warning?.facts).toContainEqual({ code: 'imitates', resembles: 'paypal.com' })
  })

  it('when the form sends the password somewhere else', () => {
    const warning = guardCredentialEntry(ctx({ postsTo: 'https://collector.test' }))
    expect(warning?.facts.map((fact) => fact.code)).toContain('posts-elsewhere')
    expect(warning?.severity).toBe('major')
  })

  it('when this device has only just met the site', () => {
    const warning = guardCredentialEntry(ctx({ firstSeen: '2026-08-05T09:00:00.000Z' }))
    expect(warning?.facts).toContainEqual({ code: 'first-day' })
  })

  it('counting the days when there are a few', () => {
    const warning = guardCredentialEntry(ctx({ firstSeen: '2026-08-02T12:00:00.000Z' }))
    expect(warning?.facts).toContainEqual({ code: 'seen-for-days', days: 3 })
  })
})

describe('what it admits not knowing', () => {
  it('names the missing history instead of calling the site new', () => {
    const warning = guardCredentialEntry(ctx({ firstSeen: null }))
    expect(warning?.missing).toContainEqual({ code: 'how-long-visited' })
    expect(warning?.facts.map((fact) => fact.code)).not.toContain('first-day')
  })

  it('always says the registration date is not something it looks up', () => {
    // Looking it up would mean sending the address of every login page the
    // user visits to a server.
    const warning = guardCredentialEntry(ctx({ secure: false }))
    expect(warning?.missing).toContainEqual({ code: 'when-registered' })
  })

  it('says nothing at all when there is nothing to say, missing facts included', () => {
    expect(guardCredentialEntry(ctx())).toBeNull()
  })
})

describe('severity', () => {
  it('takes the worst of several problems, not the last one seen', () => {
    const warning = guardCredentialEntry(ctx({ secure: false, postsTo: 'https://elsewhere.test' }))
    expect(warning?.severity).toBe('critical')
  })
})

describe('this guard has no language to be missing', () => {
  /**
   * Recorded because three detectors in this codebase turned out to read
   * English only, and the next sweep should not have to re-derive that this
   * one is different. It reads facts, not wording: whether the connection is
   * encrypted, whether the address imitates a watched name, how long this
   * device has known the domain, and where the form posts. None of that is
   * written in any language.
   */
  const base = {
    host: 'пример.рф',
    trusted: false,
    firstSeen: null,
    secure: false,
    postsTo: null,
    resembles: null,
    now: '2026-08-08T00:00:00.000Z',
  }

  it('warns about an unencrypted form on a host with no Latin letters in it', () => {
    const warning = guardCredentialEntry(base)
    expect(warning?.severity).toBe('critical')
  })

  it('gives the same verdict whatever the page is written in', () => {
    // The context carries no page text at all, which is the point: there is
    // nothing here for a language to change.
    const cyrillic = guardCredentialEntry({ ...base, host: 'сбербанк-вход.рф' })
    const latin = guardCredentialEntry({ ...base, host: 'sberbank-login.test' })
    expect(cyrillic?.severity).toBe(latin?.severity)
    expect(cyrillic?.facts.length).toBe(latin?.facts.length)
  })
})
