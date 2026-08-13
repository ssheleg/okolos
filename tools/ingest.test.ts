import { describe, expect, it } from 'vitest'

// @ts-expect-error — a plain .mjs tool, imported for the parsing it does.
import { buildSnapshot, guard, hostFrom, hostsFrom, NEVER_BLOCK, RULE_LIMIT, SHORT_HOST_CHARS, SOURCES } from './ingest.mjs'

/**
 * The blocklist builder, and the two ways it can hurt someone.
 *
 * Blocking too little is a product that does nothing. Blocking too much is a
 * product that takes down Dropbox for everyone who installed it — and that is
 * not hypothetical: URLhaus lists malware URLs, its third line is a
 * `dropbox.com` link, and at host granularity that entry is a global outage
 * with this extension's name on it.
 */

describe('a feed line becomes a host, or nothing at all', () => {
  it('reads a bare domain', () => {
    expect(hostFrom('evil-login.test')).toBe('evil-login.test')
  })

  it('reads the host out of a URL and drops the path', () => {
    expect(hostFrom('https://secure-bank.test/login?next=/a')).toBe('secure-bank.test')
  })

  it('lower-cases and drops a trailing dot', () => {
    expect(hostFrom('HTTPS://Evil.TEST./x')).toBe('evil.test')
  })

  it('ignores comments and blank lines', () => {
    for (const line of ['', '   ', '# a header', '#']) expect(hostFrom(line)).toBeNull()
  })

  it('refuses a bare IP address', () => {
    // The interstitial names the domain a list flagged. There is no domain in
    // `182.117.68.188:46150`, and URLhaus is full of them.
    expect(hostFrom('http://182.117.68.188:46150/i')).toBeNull()
    expect(hostFrom('182.117.68.188')).toBeNull()
  })

  it('refuses a single label', () => {
    expect(hostFrom('localhost')).toBeNull()
    expect(hostFrom('http://intranet/')).toBeNull()
  })

  it('refuses a line it cannot parse rather than guessing', () => {
    expect(hostFrom('not a url at all !!')).toBeNull()
    expect(hostFrom('http://')).toBeNull()
  })
})

describe('the sweep keeps order and drops repeats', () => {
  it('keeps the source order — the cap depends on it', () => {
    const hosts = hostsFrom('https://a.test/1\nhttps://b.test/2\nhttps://c.test/3')
    expect(hosts).toEqual(['a.test', 'b.test', 'c.test'])
  })

  it('keeps the first sighting of a host that appears twice', () => {
    expect(hostsFrom('https://a.test/1\nhttps://a.test/2\nhttps://b.test/')).toEqual([
      'a.test',
      'b.test',
    ])
  })

  it('survives a real header block', () => {
    const text = [
      '################################',
      '# abuse.ch Plain-Text URL List #',
      '# Last updated: 2026-08-13     #',
      '################################',
      '#',
      '# url',
      'https://phish.test/login',
    ].join('\n')
    expect(hostsFrom(text)).toEqual(['phish.test'])
  })
})

describe('hosts that must never be blocked whole', () => {
  const refusedHosts = (hosts: string[]): string[] =>
    (guard(hosts).refused as Array<{ host: string }>).map((r) => r.host)

  it('refuses Dropbox, which is how this rule got written', () => {
    const { kept } = guard(['dropbox.com', 'phish.test'])
    expect(refusedHosts(['dropbox.com', 'phish.test'])).toEqual(['dropbox.com'])
    expect(kept).toEqual(['phish.test'])
  })

  it('refuses a shortener the fixed list had never heard of', () => {
    // All five of these came out of the first real run and none was listed.
    // OpenPhish saw a shortened link and reported the shortener's host.
    expect(refusedHosts(['g5.lu', 'goo.su', 's4w.in', 'i.gal', 'vo.la'])).toHaveLength(5)
  })

  it('keeps a short host that has a subdomain — that is one campaign', () => {
    expect(guard(['login.vo.la']).kept).toEqual(['login.vo.la'])
  })

  it('keeps an ordinary phishing host of ordinary length', () => {
    // The median host in the first run was 22 characters. The threshold has to
    // leave those alone or the feed blocks nothing.
    expect(guard(['wells-fargo-ac06dd.previewship.net']).kept).toHaveLength(1)
    expect(guard(['biyhv.com']).kept).toHaveLength(1)
  })

  it('says why it refused each host, not merely that it did', () => {
    const refused = guard(['dropbox.com', 'g5.lu']).refused as Array<{ why: string }>
    expect(refused).toHaveLength(2)
    for (const r of refused) expect(r.why).not.toBe('')
    expect(refused[0]?.why).not.toBe(refused[1]?.why)
  })

  it('draws the short-host line where it was measured', () => {
    expect(SHORT_HOST_CHARS).toBe(8)
  })

  it('refuses a deployment platform whose apex is a suffix, not a site', () => {
    // Blocking `vercel.app` takes down every site anyone has ever deployed
    // there, including sites that have nothing to do with this feed.
    expect(guard(['vercel.app']).kept).toEqual([])
    expect(guard(['pages.dev']).kept).toEqual([])
  })

  it('still blocks one campaign on a shared platform', () => {
    // The guard is an exact match on purpose: a subdomain is one campaign's
    // host, and blocking it harms nobody else.
    expect(guard(['cardiffsegurogrupoamigo360.vercel.app']).kept).toEqual([
      'cardiffsegurogrupoamigo360.vercel.app',
    ])
  })

  it('refuses this service itself', () => {
    // A feed that listed the service would take the feed's own delivery down
    // with it, and the status page the owner would use to complain.
    const { kept } = guard(['okolos-proxy.sergeysheleg4.workers.dev'])
    expect(kept).toEqual([])
  })

  it('reports what it refused rather than dropping it in silence', () => {
    // A feed that has started listing shared hosts is news. Swallowed, it looks
    // exactly like a feed that has not.
    expect(guard(['github.com', 'drive.google.com']).refused).toHaveLength(2)
  })

  it('names every guarded host in lower case, so the comparison can match', () => {
    for (const host of NEVER_BLOCK) expect(host).toBe((host as string).toLowerCase())
  })
})

describe('the snapshot fits what the browser can enforce', () => {
  const hosts = Array.from({ length: RULE_LIMIT + 250 }, (_, i) => `h${i}.test`)

  it('caps at the rule ceiling and says how many it left out', () => {
    const { update, dropped } = buildSnapshot({
      hosts,
      version: 4,
      updatedAt: '2026-08-13T00:00:00.000Z',
    })
    expect(update.body.entries).toHaveLength(RULE_LIMIT)
    expect(dropped).toBe(250)
  })

  it('keeps the freshest, because the source orders newest first', () => {
    const { update } = buildSnapshot({
      hosts,
      version: 4,
      updatedAt: '2026-08-13T00:00:00.000Z',
    })
    expect(update.body.entries[0]).toBe('h0.test')
  })

  it('leaves nothing out when the feed fits', () => {
    const { update, dropped } = buildSnapshot({
      hosts: ['a.test'],
      version: 2,
      updatedAt: '2026-08-13T00:00:00.000Z',
    })
    expect(dropped).toBe(0)
    expect(update).toEqual({
      kind: 'snapshot',
      body: {
        name: 'phishing',
        version: 2,
        updatedAt: '2026-08-13T00:00:00.000Z',
        entries: ['a.test'],
      },
    })
  })
})

describe('the sources are the ones the reasoning allows', () => {
  it('ingests OpenPhish and nothing that lists paths on shared hosts', () => {
    expect(SOURCES).toHaveLength(1)
    expect((SOURCES[0] as { url: string }).url).toContain('openphish.com')
  })

  it('does not ingest URLhaus', () => {
    // Recorded as a test rather than only as a comment: a future pass adding it
    // for the entry count should have to delete this line and read why.
    const urls = (SOURCES as Array<{ url: string }>).map((s) => s.url).join(' ')
    expect(urls).not.toContain('urlhaus')
    expect(urls).not.toContain('phishing.army')
  })
})
