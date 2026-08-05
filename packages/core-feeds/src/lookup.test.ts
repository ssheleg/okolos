import { describe, expect, it } from 'vitest'

import { matchUrl, normaliseEntry } from './lookup.js'
import type { FeedSnapshot } from './apply.js'

function feed(entries: string[]): FeedSnapshot {
  return { name: 'phishing', version: 3, updatedAt: '2026-08-01T00:00:00.000Z', entries }
}

describe('normalising', () => {
  it('reduces a URL to host and path', () => {
    expect(normaliseEntry('https://Bad.TEST/login?token=secret#x')).toBe('bad.test/login')
  })

  it('accepts a bare host as publishers write them', () => {
    expect(normaliseEntry('bad.test')).toBe('bad.test')
  })

  it('drops a trailing dot and a trailing slash, which are the same host', () => {
    expect(normaliseEntry('bad.test./')).toBe('bad.test')
  })

  it('refuses what it cannot parse rather than guessing', () => {
    expect(normaliseEntry('   ')).toBeNull()
    expect(normaliseEntry('http://')).toBeNull()
  })
})

describe('matching', () => {
  it('finds an exact host', () => {
    expect(matchUrl('https://bad.test/anything', feed(['bad.test']))?.entry).toBe('bad.test')
  })

  it('finds a subdomain of a listed host', () => {
    // Attackers move one label to the left faster than any feed is updated.
    expect(matchUrl('https://login.bad.test/', feed(['bad.test']))).not.toBeNull()
  })

  it('does not match a host that merely ends with the same letters', () => {
    expect(matchUrl('https://notbad.test/', feed(['bad.test']))).toBeNull()
  })

  it('treats a path entry as a prefix, at a path boundary', () => {
    const f = feed(['bank.test/login'])
    expect(matchUrl('https://bank.test/login/step2', f)).not.toBeNull()
    expect(matchUrl('https://bank.test/loginhelp', f)).toBeNull()
  })

  it('ignores the query string, which a feed never carries', () => {
    expect(matchUrl('https://bad.test/x?session=secret', feed(['bad.test']))).not.toBeNull()
  })

  it('says which feed and which version produced the match', () => {
    // The interstitial names its authority; that has to come from somewhere.
    const match = matchUrl('https://bad.test/', feed(['bad.test']))
    expect(match).toMatchObject({ feed: 'phishing', version: 3 })
  })

  it('returns nothing for a clean URL, rather than a match with an empty entry', () => {
    expect(matchUrl('https://example.test/', feed(['bad.test']))).toBeNull()
  })

  it('skips an unparseable entry instead of failing the whole lookup', () => {
    expect(matchUrl('https://bad.test/', feed(['   ', 'bad.test']))).not.toBeNull()
  })

  it('has nothing to say about a URL it cannot parse', () => {
    expect(matchUrl('not a url', feed(['bad.test']))).toBeNull()
  })
})
