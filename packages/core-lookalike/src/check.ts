import { mixesScripts, skeleton } from './confusables.js'
import { toUnicodeHost } from './punycode.js'
import { labelsAbove, publicSuffixOf, registrableLabel } from './suffix.js'

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

  const label = registrableLabel(decoded)

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
    const targetLabel = registrableLabel(target)

    // Checked first because it is the more specific answer: the name is
    // identical and only the ending differs, which "homograph" would not say.
    if (endingIsOneEditAway(decoded, target)) {
      return { kind: 'tld-swap', visited, decoded, resembles: target, distance: 0 }
    }

    if (skeleton(label) === skeleton(targetLabel)) {
      /**
       * A homograph is a name whose *characters* differ while looking the same.
       * When the labels are the identical string, nothing looks like anything —
       * the only difference is the ending, and that case has just been judged
       * above on the one ground the device can judge it: whether the ending is a
       * plausible mistyping. Falling through to here reported `google.de` as a
       * homograph of `google.com` after the ending rule had deliberately let it
       * pass, which is how a tightened rule leaks out of a looser one beside it.
       */
      if (label !== targetLabel) {
        return {
          kind: mixesScripts(label) ? 'mixed-script' : 'homograph',
          visited,
          decoded,
          resembles: target,
          distance: 0,
        }
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
  /**
   * One rule, stated once: the brand appears among the labels the registrant put
   * **in front of their own domain**. Everything the function used to get wrong
   * came from stating it twice and stating it loosely.
   *
   * "Anywhere but the last label" made `amazon.co.uk` hand up `amazon` as a
   * subdomain of `co` — the brand on its own site, reported as impersonating
   * itself. "The full name anywhere but the end" made `amazon.com.br` and
   * `microsoft.com.au` into impersonations, because the run `amazon.com` does sit
   * in front of `br` — and `br` is a registry's label, not a registrant's, so
   * nobody is standing in front of anybody. Above the registrable domain there is
   * nothing at all in either host, which is what "this is the real company"
   * looks like from here.
   */
  const above = labelsAbove(decoded)
  if (above.length === 0) return false

  // The full watched name as a run of those labels: `paypal.com.evil.test`.
  const targetLabels = target.split('.').filter(Boolean)
  for (let at = 0; at + targetLabels.length <= above.length; at += 1) {
    if (targetLabels.every((part, i) => above[at + i] === part)) return true
  }

  /**
   * Or its own name standing alone among them: `paypal.evil.test`.
   *
   * Restricted to brand labels that are names rather than service words. Read
   * without that, `mail.ru` made `mail.yahoo.com`, `mail.proton.me` and
   * `mail.qq.com` into impersonations — three of the largest mail providers on
   * the web.
   */
  const brand = registrableLabel(target)
  if (brand === '' || GENERIC_LABELS.has(brand)) return false
  return above.includes(brand)
}

/**
 * Watched names whose own first label names a service, not a brand.
 *
 * Kept as a list of two rather than a rule, because it is a list of two: of the
 * fifty watched names, `mail.ru` and `office.com` are the ones whose brand label
 * is a word the whole web uses for a subdomain. A length threshold was the
 * alternative and it is worse — it would have silently dropped `vtb`, `mkb`,
 * `mos`, `ozon` and `cdek`, five names this product exists to protect, to catch
 * two it can name.
 *
 * The full watched name is still matched as a run of labels, so `mail.ru.evil.test`
 * is caught; what is given up is `mail.evil.test`, and that is the trade a mail
 * provider's subdomain buys.
 */
const GENERIC_LABELS: ReadonlySet<string> = new Set(['mail', 'office'])

/**
 * The same name under an ending one edit away from the brand's.
 *
 * The rule used to be "same second-to-last label, different last label", and a
 * brand's own country domain satisfies it exactly: `google.de`, `yandex.com`,
 * `github.io`, `stripe.dev`, `discord.gg`, `sberbank.com`, `telegram.me`,
 * `vk.ru`, `ozon.by` were all reported as swapped endings, and every one of them
 * is the real company. Nothing on the device can tell a brand's ccTLD from a
 * squatter's TLD — ownership is not a fact a content script has.
 *
 * What it can tell is a **mistyped** ending from a different market. `.co` and
 * `.cm` are one edit from `.com` and are the classic squats; `.de`, `.io`,
 * `.dev`, `.gg`, `.me`, `.ru`, `.by` are three, two, three, three, three, three
 * and two. So the ending must be one edit from the brand's, which keeps
 * `paypal.co` and `amazon.co` and gives up the rest — named as a limit rather
 * than paid for with a warning on `google.de`.
 */
function endingIsOneEditAway(host: string, target: string): boolean {
  const here = publicSuffixOf(host)
  const there = publicSuffixOf(target)
  if (here === '' || there === '' || here === there) return false
  return registrableLabel(host) === registrableLabel(target) && editDistance(here, there) === 1
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
