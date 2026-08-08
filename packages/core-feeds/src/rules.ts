import { normaliseEntry, type FeedSnapshot } from './index.js'

/**
 * Turning a feed into browser-level blocking rules.
 *
 * A page that is stopped only after it has rendered has already run its
 * scripts, shown its form and started its timer. Blocking has to happen in the
 * network layer, which means `declarativeNetRequest` rules — and those come
 * with a hard ceiling on how many an extension may install.
 *
 * The ceiling is the interesting part. A feed larger than the limit cannot be
 * fully enforced, and the honest response is to say how much was left out
 * rather than to enforce a silent subset and call it protection.
 */

/** Chrome's dynamic-rule ceiling; kept well under it, and stated when hit. */
export const RULE_LIMIT = 5000

export interface BlockRule {
  readonly id: number
  readonly priority: number
  readonly action: { readonly type: 'redirect'; readonly redirect: { readonly extensionPath: string } }
  readonly condition: {
    readonly urlFilter: string
    readonly resourceTypes: readonly ['main_frame']
    /**
     * Hosts this rule must not stop, because the user said so.
     *
     * `||shop.test^` covers www.shop.test as well, so a listing on a parent
     * used to override an exception granted on a child: the user chose to
     * continue, was stopped again next visit, and learned that trusting a site
     * does nothing. The listing still stands for everyone else.
     */
    readonly excludedRequestDomains?: readonly string[]
  }
}

export interface RuleSet {
  readonly rules: readonly BlockRule[]
  /** Entries the limit left out. Zero means the feed is fully enforced. */
  readonly dropped: number
  readonly excluded: number
}

export function buildRules(
  feed: FeedSnapshot,
  exceptions: readonly string[],
  redirectPath: string,
): RuleSet {
  const excused = new Set(
    exceptions.map((entry) => normaliseEntry(entry)).filter((entry): entry is string => entry !== null),
  )

  const wanted: string[] = []
  const already = new Set<string>()
  let excluded = 0

  for (const raw of feed.entries) {
    const entry = normaliseEntry(raw)
    if (entry === null) continue
    // A domain the user chose to keep visiting is not blocked again. The
    // decision was theirs and it was recorded; overriding it silently would
    // teach them the exception does not work.
    if (excused.has(entry) || excused.has(entry.split('/')[0] as string)) {
      excluded += 1
      continue
    }
    // The same live campaign appears on OpenPhish, PhishTank and URLhaus, so a
    // merged feed repeats itself. Every repetition used to take a slot from a
    // domain that would otherwise have been blocked, and to be counted as
    // protection lost to the ceiling when it was nothing of the kind.
    if (already.has(entry)) continue
    already.add(entry)
    wanted.push(entry)
  }

  const kept = wanted.slice(0, RULE_LIMIT)

  return {
    rules: kept.map((entry, index) => {
      const excusedBelow = trustedUnder(entry, excused)
      return {
        id: index + 1,
        priority: 1,
        action: { type: 'redirect', redirect: { extensionPath: redirectPath } },
        condition: {
          // `||` anchors to a domain and covers its subdomains; the trailing part
          // of the entry, if any, keeps a path-scoped listing path-scoped.
          urlFilter: entry.includes('/') ? `||${entry}` : `||${entry}^`,
          resourceTypes: ['main_frame'] as const,
          ...(excusedBelow.length > 0 ? { excludedRequestDomains: excusedBelow } : {}),
        },
      }
    }),
    dropped: Math.max(0, wanted.length - kept.length),
    excluded,
  }
}

/**
 * Trusted hosts this listing would otherwise stop.
 *
 * Only downwards. A listing on `shop.test` reaches `www.shop.test`, so an
 * exception granted there has to be honoured. The reverse stays closed:
 * trusting `shop.test` must not excuse a listing on `evil.shop.test`, because
 * subdomain takeover is exactly how that would be abused.
 */
function trustedUnder(entry: string, excused: ReadonlySet<string>): string[] {
  if (entry.includes('/')) return []
  return [...excused].filter((host) => host.endsWith(`.${entry}`)).sort()
}
