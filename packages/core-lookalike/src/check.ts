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
  readonly kind: 'mixed-script' | 'homograph' | 'typo' | 'tld-swap'
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
  const visited = host.trim().toLowerCase().replace(/\.$/, '')
  if (visited === '') return null

  const decoded = toUnicodeHost(visited)

  for (const watched of watchlist) {
    const target = watched.trim().toLowerCase()
    if (target === '') continue
    // The genuine article, and anything beneath it, is not a lookalike of itself.
    if (decoded === target || decoded.endsWith(`.${target}`)) return null
  }

  const label = registrable(decoded)

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
