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
 * Multi-label public suffixes, longest match wins.
 *
 * Held as a set of strings rather than a tree: at this size a set lookup per
 * candidate suffix is faster than building a tree, and a tree that nobody can
 * read is a tree nobody checks against the real list.
 */
const MULTI_LABEL: ReadonlySet<string> = new Set([
  // The ones the watchlist and its markets actually meet.
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'sch.uk',
  'gov.ru', 'net.ru', 'org.ru', 'com.ru', 'edu.ru', 'ac.ru', 'msk.ru', 'spb.ru',
  'com.ua', 'net.ua', 'org.ua', 'gov.ua', 'kiev.ua',
  'com.by', 'gov.by', 'com.kz', 'gov.kz', 'org.kz',
  'co.il', 'org.il', 'gov.il', 'ac.il', 'net.il',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'ad.jp', 'lg.jp',
  'co.kr', 'or.kr', 'go.kr', 'ne.kr', 're.kr',
  'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in', 'firm.in',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
  'com.hk', 'org.hk', 'edu.hk', 'gov.hk', 'com.tw', 'org.tw', 'gov.tw',
  'com.sg', 'edu.sg', 'gov.sg', 'com.my', 'org.my', 'gov.my',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz',
  'co.za', 'org.za', 'gov.za', 'ac.za', 'web.za',
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
  'com.mx', 'gob.mx', 'org.mx', 'edu.mx',
  'com.ar', 'gob.ar', 'org.ar', 'com.co', 'gov.co', 'com.pe', 'com.ve',
  'com.tr', 'gov.tr', 'org.tr', 'edu.tr', 'net.tr',
  'com.pl', 'net.pl', 'org.pl', 'gov.pl', 'edu.pl',
  'co.id', 'or.id', 'go.id', 'ac.id', 'web.id',
  'com.ph', 'gov.ph', 'com.vn', 'gov.vn', 'co.th', 'in.th', 'go.th',
  'com.sa', 'gov.sa', 'com.eg', 'gov.eg', 'com.ng', 'gov.ng',
  'com.pk', 'gov.pk', 'com.bd', 'gov.bd', 'co.ke', 'go.ke',
  'com.es', 'org.es', 'gob.es', 'com.pt', 'gov.pt', 'com.gr', 'gov.gr',
  'co.at', 'or.at', 'com.de', 'com.fr', 'gouv.fr', 'com.it', 'gov.it',
  'co.no', 'com.se', 'com.cy', 'gov.cy',
])

/** The longest suffix the registry owns, e.g. `co.uk` in `amazon.co.uk`. */
export function publicSuffixOf(host: string): string {
  const labels = host.split('.').filter(Boolean)
  if (labels.length === 0) return ''
  // Only two-label suffixes are tabulated, so two candidates: the last pair and
  // the last label. Longest first — `co.uk` must beat `uk`.
  if (labels.length >= 2) {
    const pair = `${labels[labels.length - 2]}.${labels[labels.length - 1]}`
    if (MULTI_LABEL.has(pair)) return pair
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
