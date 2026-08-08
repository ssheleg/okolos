import type { Leak } from './merge.js'

/**
 * Splitting what leaked into the two piles that mean different things.
 *
 * A breach from 2016 and an infostealer infection from last month both put a
 * password in a corpus, and the response to them is not the same. The old
 * breach is a password to change when convenient. The infostealer is a machine
 * that was, and may still be, under someone else's control — every credential
 * on it went at once, along with the session cookies that survive a password
 * change.
 *
 * Showing them in one date-sorted list makes the second look like a slightly
 * more recent instance of the first. The split is the whole point of the
 * screen.
 */

export type LeakUrgency = 'fresh-infostealer' | 'historical'

export interface LeakGroup {
  readonly urgency: LeakUrgency
  /**
   * Catalogue key for the heading, not the heading.
   *
   * Which group is called what is a product decision and belongs here; the
   * sentence is a translation and belongs in `_locales`. A core package that
   * held English prose could not be localised without importing the resolver
   * into every module that groups anything.
   */
  readonly titleKey: string
  /** One sentence on why this pile is its own pile. */
  /** Catalogue key for the explanation. Same reasoning as `titleKey`. */
  readonly whyKey: string
  readonly leaks: readonly Leak[]
}

/** Beyond this an infostealer hit is history rather than an emergency. */
export const FRESH_WITHIN_DAYS = 180

const STEALER = /(infostealer|stealer|redline|raccoon|vidar|lumma|stealc|malware)/i
const SESSION_MATERIAL = /(session|cookie|token)/i

/**
 * An infostealer hit is recognised by what it took, not only by its name.
 * A source that reports "session cookies" has described a compromised machine
 * whatever it calls the record.
 */
export function isInfostealer(leak: Leak): boolean {
  return STEALER.test(leak.name) || leak.classes.some((entry) => SESSION_MATERIAL.test(entry))
}

export function groupLeaks(leaks: readonly Leak[], now: string): readonly LeakGroup[] {
  const fresh: Leak[] = []
  const historical: Leak[] = []

  for (const leak of leaks) {
    // Undated goes to history: without a date there is no evidence of urgency,
    // and inventing it would put an old breach at the top of the emergency pile.
    const recent = leak.occurredAt !== null && daysBetween(leak.occurredAt, now) <= FRESH_WITHIN_DAYS
    if (isInfostealer(leak) && recent) fresh.push(leak)
    else historical.push(leak)
  }

  const groups: LeakGroup[] = []
  if (fresh.length > 0) {
    groups.push({
      urgency: 'fresh-infostealer',
      titleKey: 'leaksGroupFreshTitle',
      whyKey: 'leaksGroupFreshWhy',
      leaks: fresh,
    })
  }
  if (historical.length > 0) {
    groups.push({
      urgency: 'historical',
      titleKey: 'leaksGroupOlderTitle',
      whyKey: 'leaksGroupOlderWhy',
      leaks: historical,
    })
  }
  return groups
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(from)
  const b = Date.parse(to)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY
  return Math.abs(b - a) / 86_400_000
}
