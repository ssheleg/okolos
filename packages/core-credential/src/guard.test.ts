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
    expect(warning?.facts[0]).toMatch(/not encrypted/i)
  })

  it('when the address imitates one the user trusts', () => {
    const warning = guardCredentialEntry(ctx({ resembles: 'paypal.com' }))
    expect(warning?.severity).toBe('critical')
    expect(warning?.facts.join(' ')).toContain('paypal.com')
  })

  it('when the form sends the password somewhere else', () => {
    const warning = guardCredentialEntry(ctx({ postsTo: 'https://collector.test' }))
    expect(warning?.facts.join(' ')).toContain('collector.test')
    expect(warning?.severity).toBe('major')
  })

  it('when this device has only just met the site', () => {
    const warning = guardCredentialEntry(ctx({ firstSeen: '2026-08-05T09:00:00.000Z' }))
    expect(warning?.facts.join(' ')).toMatch(/first day/i)
  })

  it('counting the days when there are a few', () => {
    const warning = guardCredentialEntry(ctx({ firstSeen: '2026-08-02T12:00:00.000Z' }))
    expect(warning?.facts.join(' ')).toContain('3 days ago')
  })
})

describe('what it admits not knowing', () => {
  it('names the missing history instead of calling the site new', () => {
    const warning = guardCredentialEntry(ctx({ firstSeen: null }))
    expect(warning?.missing.join(' ')).toMatch(/no earlier visit is recorded/i)
    expect(warning?.facts.join(' ')).not.toMatch(/first day/i)
  })

  it('always says the registration date is not something it looks up', () => {
    // Looking it up would mean sending the address of every login page the
    // user visits to a server.
    const warning = guardCredentialEntry(ctx({ secure: false }))
    expect(warning?.missing.join(' ')).toMatch(/registered/i)
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
