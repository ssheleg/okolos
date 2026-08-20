/**
 * Where a name stops belonging to whoever registered it.
 *
 * Every rule in `check.ts` is about one question — is the brand standing where
 * the brand does not belong — and answering it needs to know which labels a
 * registrant chose and which the registry did. Without that, the code took "the
 * second-to-last label" as the registrant's, and measured 2026-08-20 that
 * reported twenty-one genuine hosts out of thirty-four as impersonation:
 * `amazon.co.uk`, `apple.co.jp`, `microsoft.com.au` and `booking.co.il` (whose
 * brand looked like a subdomain of `co`), and **every Russian government site**,
 * because `pfr.gov.ru` and `nalog.gov.ru` share the second-to-last label `gov`
 * and were therefore homographs of each other.
 *
 * **This table is a curated subset of the Public Suffix List, not the list.** It
 * carries the multi-label suffixes that matter for a fifty-name watchlist and for
 * the markets this product serves, and the limit is named rather than implied: a
 * suffix that is not here is read as a single label, which makes the registrable
 * domain one label too short and can only cause a **missed** finding, never a
 * false one — the safe direction. Vendoring the real list is B-66.
 */

/**
 * The table itself, as data.
 *
 * A JSON file rather than a constant, because it has two readers: this module and
 * `tools/ingest.mjs`, which is plain Node and cannot import TypeScript. Before
 * this, the blocklist carried **its own** hand-written list of forty-eight exact
 * matches — and measured 2026-08-20 it was missing every platform the source
 * actually emits hosts under: `github.io`, `backblazeb2.com`,
 * `trycloudflare.com`, `edgeone.dev`, `bolt.host`, `webflow.io`. Two copies of a
 * list agree with each other and with nothing else, which this repository has now
 * paid for four times.
 */
import TABLE from './suffixes.json' with { type: 'json' }

/**
 * Multi-label public suffixes, longest match wins.
 *
 * Held as a set of strings rather than a tree: at this size a set lookup per
 * candidate suffix is faster than building a tree, and a tree that nobody can
 * read is a tree nobody checks against the real list.
 */
const MULTI_LABEL: ReadonlySet<string> = new Set(TABLE.icann)

/**
 * Suffixes somebody rents out, not a registry: the Public Suffix List's private
 * section, where the registrant is whoever holds the label in front.
 *
 * These matter more than the ICANN ones for one reason. Blocking rules are
 * `||host^`, which covers every subdomain — so listing `github.io` as a malicious
 * host takes down **every GitHub Pages site** for everyone who installed the
 * extension. Measured 2026-08-20, today's source carried nine hosts under
 * `github.io`, four under `backblazeb2.com`, and hosts under `trycloudflare.com`,
 * `edgeone.dev`, `bolt.host` and `webflow.io`; eighteen of its 281 entries were
 * two labels, meaning the source does report apexes. The day it reports the apex
 * of one of these is the day the extension breaks a platform, and the
 * short-host heuristic does not save it — `github.io` is nine characters.
 *
 * Curated rather than the whole list, and the trade is the opposite way round
 * from the ICANN table above: there, a missing suffix loses a finding, and here a
 * missing suffix **blocks a platform**. So this list carries every platform the
 * source has been observed to emit hosts under, and B-66 remains the row for
 * vendoring the real thing.
 */
const PRIVATE_SUFFIXES: ReadonlySet<string> = new Set(TABLE.private)

/**
 * Whether this host **is** a suffix rather than a site under one.
 *
 * The one question the blocklist has to ask before it emits a rule, because a
 * rule is `||host^` and covers everything beneath. `evil.github.io` is a site;
 * `github.io` is the ground a hundred thousand sites stand on.
 */
export function isPublicSuffix(host: string): boolean {
  const cleaned = host.trim().toLowerCase().replace(/\.$/, '')
  if (cleaned === '') return false
  if (MULTI_LABEL.has(cleaned) || PRIVATE_SUFFIXES.has(cleaned)) return true
  // A single label is a top-level domain: `com`, `io`, `test`.
  return !cleaned.includes('.')
}

/** The longest suffix the registry owns, e.g. `co.uk` in `amazon.co.uk`. */
export function publicSuffixOf(host: string): string {
  const labels = host.split('.').filter(Boolean)
  if (labels.length === 0) return ''
  // Only two-label suffixes are tabulated, so two candidates: the last pair and
  // the last label. Longest first — `co.uk` must beat `uk`.
  if (labels.length >= 3) {
    const triple = labels.slice(-3).join('.')
    if (PRIVATE_SUFFIXES.has(triple)) return triple
  }
  if (labels.length >= 2) {
    const pair = `${labels[labels.length - 2]}.${labels[labels.length - 1]}`
    // Both tables, longest match first. A private suffix decides who the
    // registrant is exactly as an ICANN one does: `user.github.io` is that
    // user's, and nothing above it belongs to them.
    if (MULTI_LABEL.has(pair) || PRIVATE_SUFFIXES.has(pair)) return pair
  }
  return labels[labels.length - 1] as string
}

/**
 * The name the registrant holds: the public suffix plus one label.
 *
 * Returns the whole host when there is nothing above the suffix — a bare
 * `co.uk` is a suffix and not a domain, and saying so is more useful than
 * inventing a registrant for it.
 */
export function registrableDomain(host: string): string {
  const suffix = publicSuffixOf(host)
  const labels = host.split('.').filter(Boolean)
  const suffixLabels = suffix.split('.').filter(Boolean).length
  if (labels.length <= suffixLabels) return labels.join('.')
  return labels.slice(labels.length - suffixLabels - 1).join('.')
}

/** The label the registrant chose: `login.pаypal.co.uk` -> `pаypal`. */
export function registrableLabel(host: string): string {
  const labels = registrableDomain(host).split('.').filter(Boolean)
  return labels[0] ?? ''
}

/**
 * The labels the registrant added in front of their own name.
 *
 * `['accounts']` for `accounts.google.com`, `[]` for `amazon.co.uk` — and it is
 * the second of those that matters: read as "everything but the last label",
 * `amazon.co.uk` offered up `amazon` as a subdomain and the brand appeared to be
 * standing somewhere it did not belong.
 */
export function labelsAbove(host: string): readonly string[] {
  const labels = host.split('.').filter(Boolean)
  const own = registrableDomain(host).split('.').filter(Boolean).length
  return labels.slice(0, Math.max(0, labels.length - own))
}
