import type { FeedSnapshot } from './apply.js'

/**
 * Matching a URL against a feed.
 *
 * Feeds list hosts and host+path prefixes, never query strings — a blocklist
 * entry carrying someone's session token would be a leak published on purpose.
 * Matching is therefore done on the same reduced form the rest of the product
 * uses, and a subdomain of a listed host matches its parent: attackers move
 * one label to the left faster than any feed can be updated.
 */

export interface FeedMatch {
  readonly entry: string
  readonly feed: string
  readonly version: number
  readonly updatedAt: string
}

/** Lower-cased host, no trailing dot, no port, no scheme, no query. */
export function normaliseEntry(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase()
  if (trimmed === '') return null

  const withScheme = trimmed.includes('://') ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    const host = url.hostname.replace(/\.$/, '')
    if (host === '') return null
    const path = url.pathname.replace(/\/$/, '')
    return path === '' ? host : `${host}${path}`
  } catch {
    return null
  }
}

export function matchUrl(url: string, feed: FeedSnapshot): FeedMatch | null {
  const target = normaliseEntry(url)
  if (target === null) return null

  for (const raw of feed.entries) {
    const entry = normaliseEntry(raw)
    if (entry === null) continue

    if (target === entry) return hit(entry, feed)

    // A path entry covers everything beneath it: `bank.test/login` matches
    // `bank.test/login/step2` but not `bank.test/loginhelp`.
    if (entry.includes('/') && target.startsWith(`${entry}/`)) return hit(entry, feed)

    // A bare host entry covers its subdomains. Attackers move one label to the
    // left faster than any feed can be updated.
    if (!entry.includes('/') && (target === entry || target.endsWith(`.${entry}`))) {
      return hit(entry, feed)
    }
    if (!entry.includes('/') && target.startsWith(`${entry}/`)) return hit(entry, feed)
    if (!entry.includes('/')) {
      const host = target.split('/')[0] ?? ''
      if (host === entry || host.endsWith(`.${entry}`)) return hit(entry, feed)
    }
  }

  return null
}

function hit(entry: string, feed: FeedSnapshot): FeedMatch {
  return { entry, feed: feed.name, version: feed.version, updatedAt: feed.updatedAt }
}
