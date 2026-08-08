import { describe, expect, it } from 'vitest'

import { PROXY_ORIGIN } from '../config.js'
import { appealLinkFor } from './appeal-link.js'

describe('where an owner is sent to dispute a block', () => {
  it('goes to the public status page, not to a page only this install has', () => {
    // It used to open `options.html#appeal`: an extension page, at a hash that
    // matched nothing, with no appeal section anywhere on it.
    const link = appealLinkFor('https://mysite.test/login?token=secret')
    expect(link).toBe(`${PROXY_ORIGIN}/status?domain=mysite.test`)
  })

  it('carries the domain so the owner does not retype what they were just shown', () => {
    expect(appealLinkFor('https://shop.mysite.test/cart')).toContain('domain=shop.mysite.test')
  })

  it('carries the host and nothing else from the blocked URL', () => {
    // A blocked URL's path and query can hold a session token or a search term.
    // The status page answers about domains; the rest is none of its business.
    const link = appealLinkFor('https://mysite.test/reset?token=abc123&email=a@b.test') ?? ''
    expect(link).not.toContain('token')
    expect(link).not.toContain('abc123')
    expect(link).not.toContain('a@b.test')
  })

  it('reads a bare host, which is what a feed entry looks like', () => {
    expect(appealLinkFor('mysite.test')).toBe(`${PROXY_ORIGIN}/status?domain=mysite.test`)
  })

  it('lower-cases and drops a trailing dot, like every other lookup here', () => {
    expect(appealLinkFor('https://MySite.TEST./x')).toBe(`${PROXY_ORIGIN}/status?domain=mysite.test`)
  })

  it('escapes a host rather than letting it shape the query', () => {
    const link = appealLinkFor('https://xn--80ak6aa92e.com/') ?? ''
    expect(link).toContain('domain=xn--80ak6aa92e.com')
  })

  it('has nowhere to send an owner when there is no host, and says so', () => {
    // The interstitial falls back to "a page on this site" when the background
    // could not name the URL. Sending someone to an empty lookup form is a
    // chore handed over as if it were an answer.
    for (const nothing of [null, undefined, '', '   ', 'a page on this site', 'localhost', '..']) {
      expect(appealLinkFor(nothing), String(nothing)).toBeNull()
    }
  })
})

describe('the origin this extension talks to', () => {
  it('is named once, and every other file derives its paths from it', async () => {
    const { FEED_URL } = await import('../background/feed-sync.js')
    expect(FEED_URL.startsWith(PROXY_ORIGIN)).toBe(true)
  })
})

describe('the host literal', () => {
  it('appears in config.ts and nowhere else in the extension source', async () => {
    // "Named once" is a claim until something reads the files back. A second
    // spelling is the one that survives a move to a real domain.
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const path = await import('node:path')
    const src = path.resolve(import.meta.dirname, '..')

    const host = new URL(PROXY_ORIGIN).hostname
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name)
        if (statSync(p).isDirectory()) {
          walk(p)
        } else if (name.endsWith('.ts') && p !== path.join(src, 'config.ts')) {
          if (readFileSync(p, 'utf8').includes(host)) offenders.push(path.relative(src, p))
        }
      }
    }
    walk(src)

    expect(offenders, `these spell the worker host out instead of importing PROXY_ORIGIN`).toEqual(
      [],
    )
  })
})
