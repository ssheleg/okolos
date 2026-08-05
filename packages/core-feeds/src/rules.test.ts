import { describe, expect, it } from 'vitest'

import { buildRules, RULE_LIMIT } from './rules.js'
import type { FeedSnapshot } from './apply.js'

function feed(entries: string[]): FeedSnapshot {
  return { name: 'phishing', version: 1, updatedAt: '2026-08-05T00:00:00.000Z', entries }
}

const PATH = '/interstitial.html'

describe('what a feed becomes', () => {
  it('one rule per entry, redirecting to our own page', () => {
    const set = buildRules(feed(['bad.test']), [], PATH)
    expect(set.rules).toHaveLength(1)
    expect(set.rules[0]?.action.redirect.extensionPath).toBe(PATH)
  })

  it('applies to the page itself, not to every image on it', () => {
    const set = buildRules(feed(['bad.test']), [], PATH)
    expect(set.rules[0]?.condition.resourceTypes).toEqual(['main_frame'])
  })

  it('anchors a bare host so it covers subdomains', () => {
    expect(buildRules(feed(['bad.test']), [], PATH).rules[0]?.condition.urlFilter).toBe('||bad.test^')
  })

  it('keeps a path-scoped entry path-scoped', () => {
    expect(buildRules(feed(['bank.test/login']), [], PATH).rules[0]?.condition.urlFilter).toBe(
      '||bank.test/login',
    )
  })

  it('gives every rule a distinct id, which the browser requires', () => {
    const set = buildRules(feed(['a.test', 'b.test', 'c.test']), [], PATH)
    expect(new Set(set.rules.map((rule) => rule.id)).size).toBe(3)
  })

  it('skips an entry it cannot parse rather than emitting a broken rule', () => {
    expect(buildRules(feed(['   ', 'bad.test']), [], PATH).rules).toHaveLength(1)
  })
})

describe('what the user decided', () => {
  it('does not block a domain they chose to keep visiting', () => {
    const set = buildRules(feed(['bad.test', 'worse.test']), ['bad.test'], PATH)
    expect(set.rules).toHaveLength(1)
    expect(set.excluded).toBe(1)
  })

  it('covers a path entry under a domain-wide exception', () => {
    const set = buildRules(feed(['bad.test/login']), ['bad.test'], PATH)
    expect(set.rules).toHaveLength(0)
  })

  it('counts the exceptions, so the number is showable', () => {
    expect(buildRules(feed(['bad.test']), ['bad.test'], PATH).excluded).toBe(1)
  })
})

describe('when the feed is larger than the browser allows', () => {
  it('stays under the ceiling', () => {
    const set = buildRules(feed(Array.from({ length: RULE_LIMIT + 500 }, (_, i) => `n${i}.test`)), [], PATH)
    expect(set.rules).toHaveLength(RULE_LIMIT)
  })

  it('says how many entries it could not enforce', () => {
    // Enforcing a silent subset and calling it protection is the failure mode
    // this number exists to prevent.
    const set = buildRules(feed(Array.from({ length: RULE_LIMIT + 500 }, (_, i) => `n${i}.test`)), [], PATH)
    expect(set.dropped).toBe(500)
  })

  it('reports nothing dropped when the feed fits', () => {
    expect(buildRules(feed(['bad.test']), [], PATH).dropped).toBe(0)
  })
})
