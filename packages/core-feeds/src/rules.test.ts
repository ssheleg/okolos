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

describe('the ceiling is spent on protection, not on repetition', () => {
  const feed = (entries: string[]) => ({
    name: 'phish',
    version: 1,
    updatedAt: '2026-08-08T00:00:00.000Z',
    entries,
  })

  it('installs one rule per domain, however many times it is listed', () => {
    // Feeds are merged from OpenPhish, PhishTank and URLhaus, and a live
    // campaign appears on all three. Every duplicate takes a slot from a
    // domain that would otherwise have been blocked.
    const set = buildRules(feed(['evil.test', 'evil.test', 'evil.test']), [], '/i.html')
    expect(set.rules).toHaveLength(1)
  })

  it('collapses the same domain written differently', () => {
    const set = buildRules(
      feed(['evil.test', 'EVIL.test', 'https://evil.test', 'evil.test/']),
      [],
      '/i.html',
    )
    expect(set.rules).toHaveLength(1)
  })

  it('keeps a path-scoped listing apart from the whole domain', () => {
    // `evil.test/login` and `evil.test` are different listings and must stay
    // two rules; collapsing them would either over- or under-block.
    const set = buildRules(feed(['evil.test', 'evil.test/login']), [], '/i.html')
    expect(set.rules).toHaveLength(2)
  })

  it('does not count repetition as protection lost to the ceiling', () => {
    // `dropped` is what the user is told could not be enforced. Repetition is
    // not a loss, and reporting it as one overstates the gap.
    const unique = Array.from({ length: 4990 }, (_, i) => `d${i}.test`)
    const set = buildRules(feed([...unique, ...Array(20).fill('dup.test')]), [], '/i.html')
    expect(set.rules).toHaveLength(4991)
    expect(set.dropped).toBe(0)
  })

  it('still reports a genuine overflow', () => {
    const many = Array.from({ length: RULE_LIMIT + 10 }, (_, i) => `d${i}.test`)
    const set = buildRules(feed(many), [], '/i.html')
    expect(set.rules).toHaveLength(RULE_LIMIT)
    expect(set.dropped).toBe(10)
  })
})

describe('an exception must cover what the block covers', () => {
  const feed = (entries: string[]) => ({
    name: 'phish',
    version: 1,
    updatedAt: '2026-08-08T00:00:00.000Z',
    entries,
  })

  it('excuses a trusted host that a parent listing would block', () => {
    // `||shop.test^` blocks www.shop.test too. A user who was stopped there,
    // chose to continue and trust the site, and is stopped again next visit
    // has been taught that the exception does not work — which is exactly what
    // the code's own comment says must not happen.
    const set = buildRules(feed(['shop.test']), ['www.shop.test'], '/i.html')
    const rule = set.rules[0]
    expect(rule, 'the parent listing still stands for everyone else').toBeDefined()
    expect(rule?.condition.excludedRequestDomains).toContain('www.shop.test')
  })

  it('does not let a trusted parent excuse a listed subdomain', () => {
    // The other direction must stay closed: subdomain takeover is a real
    // attack, and trusting a shop does not vouch for evil.shop.test.
    const set = buildRules(feed(['evil.shop.test']), ['shop.test'], '/i.html')
    expect(set.rules).toHaveLength(1)
    expect(set.rules[0]?.condition.excludedRequestDomains ?? []).toEqual([])
  })

  it('still drops the rule entirely when the exact host is trusted', () => {
    const set = buildRules(feed(['shop.test']), ['shop.test'], '/i.html')
    expect(set.rules).toHaveLength(0)
    expect(set.excluded).toBe(1)
  })
})

describe('the trusted-below index answers exactly what the scan did', () => {
  /**
   * The optimisation `pnpm bench` paid for (B-49): `trustedUnder` spread the whole
   * excused set and filtered it once per kept rule, which cost four times the whole
   * build for a list of fifty exceptions. It is a map now, built once.
   *
   * These assert the *predicate*, not the speed: only downwards, every level, and never
   * upwards — trusting `shop.test` must not excuse a listing on `evil.shop.test`, which
   * is how subdomain takeover would be laundered through the exception list.
   */
  const feed = (entries: readonly string[]): FeedSnapshot => ({
    name: 'phishing',
    version: 1,
    updatedAt: '2026-08-20T00:00:00.000Z',
    entries,
  })

  const excusedBelow = (listing: string, exceptions: readonly string[]): readonly string[] =>
    buildRules(feed([listing]), exceptions, '/blocked').rules[0]?.condition.excludedRequestDomains ?? []

  it('reaches a host one level under the listing', () => {
    expect(excusedBelow('shop.test', ['www.shop.test'])).toEqual(['www.shop.test'])
  })

  it('reaches one several levels under it', () => {
    expect(excusedBelow('test', ['a.b.c.test'])).toEqual(['a.b.c.test'])
    expect(excusedBelow('c.test', ['a.b.c.test'])).toEqual(['a.b.c.test'])
  })

  it('never reaches upwards', () => {
    // The whole reason this is "below" and not "related to".
    expect(excusedBelow('evil.shop.test', ['shop.test'])).toEqual([])
  })

  it('does not treat the listing itself as below itself', () => {
    // `endsWith('.' + entry)` was false for the entry itself, and the map must agree:
    // an exception *on* the listing excludes it entirely, higher up in `buildRules`.
    expect(excusedBelow('shop.test', ['other.test'])).toEqual([])
  })

  it('returns every match, sorted, as the scan did', () => {
    expect(excusedBelow('shop.test', ['z.shop.test', 'a.shop.test', 'm.shop.test'])).toEqual([
      'a.shop.test',
      'm.shop.test',
      'z.shop.test',
    ])
  })

  it('says nothing for a listing that carries a path', () => {
    // A path listing is not a host, so nothing sits under it.
    expect(excusedBelow('shop.test/deals', ['www.shop.test'])).toEqual([])
  })
})
