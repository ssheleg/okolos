import { mixesScripts, skeleton } from './confusables.js'
import { toUnicodeHost } from './punycode.js'

/**
 * Is this host pretending to be one the user cares about?
 *
 * Three questions, in the order of how certain the answer is. A label that
 * mixes scripts is nearly always deliberate. A label whose skeleton equals a
 * watched name is a homograph. A label one edit away is a typosquat — the
 * weakest of the three, and the one where a false positive costs the most, so
 * it is held to the tightest conditions.
 *
 * What this never does is flag the real thing. An exact match and any subdomain
 * of a watched host pass silently; a warning on `accounts.google.com` would
 * teach the user to dismiss the next one without reading it.
 */

export interface LookalikeVerdict {
  readonly kind: 'mixed-script' | 'homograph' | 'typo' | 'tld-swap' | 'brand-subdomain'
  /** The host as the browser holds it — punycode included. */
  readonly visited: string
  /** What it renders as, once decoded. */
  readonly decoded: string
  readonly resembles: string
  readonly distance: number
}

export function checkLookalike(
  host: string,
  watchlist: readonly string[],
): LookalikeVerdict | null {
  const visited = hostnameOnly(host)
  if (visited === '') return null

  const decoded = toUnicodeHost(visited)

  for (const watched of watchlist) {
    const target = watched.trim().toLowerCase()
    if (target === '') continue
    // The genuine article, and anything beneath it, is not a lookalike of itself.
    if (decoded === target || decoded.endsWith(`.${target}`)) return null
  }

  const label = registrable(decoded)

  // Before any similarity test, because this one is not about similarity: the
  // name is exactly right and standing in the wrong place. `paypal.com.evil.test`
  // begins with the brand in the address bar and is the commonest phishing
  // shape there is, and every check below passed it — the registrable domain
  // is `evil.test`, which resembles nothing watched.
  for (const watched of watchlist) {
    const target = watched.trim().toLowerCase()
    if (target === '') continue
    if (wearsBrandAsLabel(decoded, target)) {
      return { kind: 'brand-subdomain', visited, decoded, resembles: target, distance: 0 }
    }
  }

  for (const watched of watchlist) {
    const target = watched.trim().toLowerCase()
    if (target === '') continue
    const targetLabel = registrable(target)

    // Checked first because it is the more specific answer: the name is
    // identical and only the ending differs, which "homograph" would not say.
    if (sameSecondLevel(decoded, target)) {
      return { kind: 'tld-swap', visited, decoded, resembles: target, distance: 0 }
    }

    if (skeleton(label) === skeleton(targetLabel)) {
      return {
        kind: mixesScripts(label) ? 'mixed-script' : 'homograph',
        visited,
        decoded,
        resembles: target,
        distance: 0,
      }
    }

    // One edit, and only for names long enough that one edit is not most of
    // the word. Below that the false-positive rate is worse than the coverage.
    const distance = editDistance(skeleton(label), skeleton(targetLabel))
    if (distance === 1 && targetLabel.length >= 5) {
      return { kind: 'typo', visited, decoded, resembles: target, distance }
    }
  }

  return null
}

/**
 * The hostname, out of whatever the caller had.
 *
 * A port made `paypal.com:443` read as second-level `paypal` with TLD
 * `com:443`, so the genuine site visited on an explicit port was reported as a
 * lookalike of itself — a false alarm on the real thing, which is the worst
 * kind this detector can raise. Credentials before an `@` belong to the
 * request, not the host, and a hostile page can put a brand there.
 */
function hostnameOnly(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  // A whole URL used to split on "/" and leave "https" — which resembles
  // nothing watched, so every check below passed and the caller got a silent
  // all-clear about a domain nobody had looked at. The one caller passes
  // `location.hostname`; this is for the next one.
  const afterScheme = trimmed.includes('://') ? trimmed.slice(trimmed.indexOf('://') + 3) : trimmed
  const afterCredentials = afterScheme.slice(afterScheme.lastIndexOf('@') + 1)
  const beforePath = afterCredentials.split('/')[0] ?? ''
  // IPv6 literals are bracketed, and a colon inside brackets is not a port.
  const beforePort = beforePath.startsWith('[')
    ? beforePath
    : (beforePath.split(':')[0] ?? '')
  return beforePort.replace(/\.$/, '')
}

/**
 * Whether a watched name stands as its own label somewhere in this host.
 *
 * Both `paypal.com.evil.test` and `paypal.evil.test` show the brand plainly in
 * the address bar. `mypaypal.test` does not — the brand is part of a longer
 * word there, and treating that as impersonation is how a detector starts
 * crying wolf.
 */
function wearsBrandAsLabel(decoded: string, target: string): boolean {
  const labels = decoded.split('.').filter(Boolean)
  const targetLabels = target.split('.').filter(Boolean)
  if (labels.length <= targetLabels.length) return false

  // The full watched name as a run of labels, anywhere but at the end — the
  // end is the genuine site, already excluded above.
  for (let at = 0; at + targetLabels.length < labels.length; at += 1) {
    if (targetLabels.every((part, i) => labels[at + i] === part)) return true
  }

  // Or its own name standing alone as a label: `paypal.evil.test`.
  const brand = targetLabels[0]
  return brand !== undefined && labels.slice(0, -1).includes(brand)
}

/** The label that matters: `login.pаypal.com` -> `pаypal`. */
function registrable(host: string): string {
  const parts = host.split('.').filter(Boolean)
  return parts.length >= 2 ? (parts[parts.length - 2] as string) : (parts[0] ?? '')
}

function sameSecondLevel(host: string, target: string): boolean {
  const a = host.split('.').filter(Boolean)
  const b = target.split('.').filter(Boolean)
  if (a.length < 2 || b.length < 2) return false
  return a[a.length - 2] === b[b.length - 2] && a[a.length - 1] !== b[b.length - 1]
}

/** Damerau-Levenshtein: a swapped pair of letters is one mistake, not two. */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))

  for (let i = 0; i < rows; i += 1) d[i]![0] = i
  for (let j = 0; j < cols; j += 1) d[0]![j] = j

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1)
      }
    }
  }

  return d[a.length]![b.length]!
}
