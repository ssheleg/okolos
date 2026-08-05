import type { Severity } from '@okolos/contracts'

/**
 * Turning everything found into a list a person can finish.
 *
 * The competitor pattern this replaces is an inbox: 203 findings, a red badge,
 * and nothing ever done. Three is not a display preference — it is the product
 * decision. What does not fit is counted, not hidden, and the count is shown so
 * nobody has to wonder whether the list is the whole truth.
 *
 * Ranking is severity first, then how easily a thing can be finished, then how
 * fresh it is. The middle term is deliberate: between two equal problems, the
 * one that takes a click is the one that actually gets done.
 */

export const QUEUE_LIMIT = 3

export type Fixability = 'one-click' | 'guided' | 'manual'

export interface QueueItem {
  readonly id: string
  readonly severity: Severity
  readonly createdAt: string
  /** Absent when the item's action registry entry could not be read. */
  readonly fixability?: Fixability
  readonly summary: string
  readonly actionLabel?: string
}

/** `severity-only` means one or more items could not be ranked in full. */
export type RankingBasis = 'full' | 'severity-only'

export interface Queue {
  readonly shown: readonly QueueItem[]
  readonly hidden: number
  readonly rankedBy: RankingBasis
}

const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 3, major: 2, minor: 1, info: 0 }
const FIXABILITY_WEIGHT: Record<Fixability, number> = { 'one-click': 2, guided: 1, manual: 0 }

export function buildQueue(items: readonly QueueItem[], limit = QUEUE_LIMIT): Queue {
  const rankedBy: RankingBasis = items.every((item) => item.fixability !== undefined)
    ? 'full'
    : 'severity-only'

  const ordered = [...items].sort((a, b) => {
    const bySeverity = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]
    if (bySeverity !== 0) return bySeverity

    if (rankedBy === 'full') {
      const byFixability =
        FIXABILITY_WEIGHT[b.fixability as Fixability] - FIXABILITY_WEIGHT[a.fixability as Fixability]
      if (byFixability !== 0) return byFixability
    }

    // Freshness, then id: the order must not depend on what the store happened
    // to hand us, or the same queue would reshuffle between two openings.
    const byFreshness = b.createdAt.localeCompare(a.createdAt)
    return byFreshness !== 0 ? byFreshness : a.id.localeCompare(b.id)
  })

  return {
    shown: ordered.slice(0, limit),
    hidden: Math.max(0, ordered.length - limit),
    rankedBy,
  }
}
