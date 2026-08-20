/**
 * What an extension is, right now — as opposed to what changed about it.
 *
 * `diffInventory` answers "what moved since last time", which is the core of the risk:
 * an extension with seven years of trust turned into spyware by a quiet update. But two
 * of the strongest signals are not changes at all. They are true of an extension the
 * first time it is seen, and a product that only reports deltas never reports them.
 *
 * Both are computed from data the browser already hands over — no package parsing, no
 * network, no store metadata. That is why they are here and the other four absent checks
 * in the coverage matrix are not (B-56).
 */

import type { ExtensionSnapshot } from './diff.js'

/**
 * How the extension got onto the machine, as `chrome.management` reports it.
 *
 * `'normal'` means the store. Everything else means it arrived another way, and the two
 * that matter are `development` (an unpacked folder someone loaded) and `sideload`
 * (installed by another program on the machine, often without being asked).
 */
export type InstallType = 'normal' | 'development' | 'sideload' | 'admin' | 'other'

/**
 * Permissions that are ordinary alone and a surveillance kit together.
 *
 * Each of these is held by something reasonable: a password manager reads cookies, an ad
 * blocker rewrites requests, a screenshot tool reads every page. The combination is what
 * has no innocent reading — everything you visit, the sessions you are signed into, and
 * the ability to change what leaves the browser, in one extension.
 *
 * Held as pairs rather than one long list because a rule that fires on "three of these
 * eight" is a rule nobody can predict; a named pair is a sentence a person can check.
 */
export const RISKY_PAIRS: readonly (readonly [string, string])[] = [
  ['cookies', 'webRequest'],
  ['cookies', 'scripting'],
  ['webRequest', 'scripting'],
  ['debugger', 'cookies'],
  ['nativeMessaging', 'cookies'],
  ['clipboardRead', 'scripting'],
]

/** Host patterns that mean "every site", however they are spelled. */
const EVERYWHERE = /^(\*:\/\/\*\/\*|<all_urls>|https?:\/\/\*\/\*)$/

export type StandingKind = 'not-from-store' | 'reads-everything-and-more'

export interface StandingFinding {
  readonly kind: StandingKind
  readonly id: string
  readonly name: string
  readonly severity: 'critical' | 'major'
  /** For `not-from-store`: how it arrived. Never translated — it is the browser's word. */
  readonly installType?: InstallType
  /** For the combination: the two permissions that make it, plus whether it reads everywhere. */
  readonly pair?: readonly [string, string]
  readonly everywhere?: boolean
}

/**
 * Facts about an extension as it stands, in the order a person should read them.
 *
 * Returns an empty list for an ordinary extension, and the caller must be able to tell
 * that from a failure — which is why this throws nothing and reads nothing: given a
 * snapshot, the answer is a pure function of it.
 */
export function standingFindings(entry: ExtensionSnapshot): StandingFinding[] {
  const found: StandingFinding[] = []

  /**
   * Not from the store, and `admin` is deliberately not reported.
   *
   * An extension pushed by a workplace policy is not a surprise to the person whose
   * machine it is — they cannot remove it either, so reporting it is an alarm with no
   * action behind it. `development` and `sideload` are the two a person can act on.
   */
  if (entry.installType === 'development' || entry.installType === 'sideload') {
    found.push({
      kind: 'not-from-store',
      id: entry.id,
      name: entry.name,
      // Sideload is the one that arrives without being asked for; a development build is
      // usually one the person loaded themselves.
      severity: entry.installType === 'sideload' ? 'critical' : 'major',
      installType: entry.installType,
    })
  }

  const held = new Set(entry.permissions)
  const everywhere = (entry.hostPermissions ?? []).some((host) => EVERYWHERE.test(host))
  for (const pair of RISKY_PAIRS) {
    if (!held.has(pair[0]) || !held.has(pair[1])) continue
    found.push({
      kind: 'reads-everything-and-more',
      id: entry.id,
      name: entry.name,
      // The same pair is a different thing on one site than on all of them.
      severity: everywhere ? 'critical' : 'major',
      pair,
      everywhere,
    })
    // One sentence per extension: a list of six overlapping pairs is a wall, and the
    // first one already says what it is.
    break
  }

  return found
}
