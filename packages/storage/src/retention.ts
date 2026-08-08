import type { OkolosDatabase } from './db.js'
import { RETENTION_DAYS } from './schema.js'

const DAY_MS = 24 * 60 * 60 * 1000

function olderThan(iso: string, days: number, nowMs: number): boolean {
  const at = Date.parse(iso)
  return Number.isFinite(at) && nowMs - at > days * DAY_MS
}

/** How long a sweep may be skipped before the next startup owes one. */
export const SWEEP_INTERVAL_MS = 12 * 60 * 60 * 1000

/** Where the last sweep's timestamp lives, so the decision survives a restart. */
export const LAST_SWEEP_KEY = 'retention:lastSweptAt'

/**
 * Whether a sweep is owed.
 *
 * The alarm alone could not be trusted with this. `alarms.create` replaces an
 * alarm of the same name, the background re-creates it on every start, and an
 * MV3 service worker starts many times a day — so a 24-hour alarm on a browser
 * in daily use can be reset before it ever fires, and the ninety-day promise
 * on the journal screen would be enforced by nothing at all.
 *
 * A timestamp in storage does not care how often the worker restarts: the
 * question at each start is only whether enough time has passed.
 */
export function dueForSweep(lastSweptAt: string | null | undefined, nowMs: number): boolean {
  if (!lastSweptAt) return true
  const at = Date.parse(lastSweptAt)
  // An unreadable timestamp is not permission to skip: sweeping twice costs a
  // few deletes, and skipping keeps data past the window the user was promised.
  if (!Number.isFinite(at)) return true
  // A clock that moved backwards (a corrected system time, a restored profile)
  // would otherwise postpone the sweep indefinitely.
  if (at > nowMs) return true
  return nowMs - at >= SWEEP_INTERVAL_MS
}

/**
 * Runs on an alarm, not on a timer held in memory.
 *
 * Findings are the exception to the sweep: an unresolved one is work the user
 * still owes themselves, and deleting it because it got old would quietly
 * discard the only record that anything was wrong. Only a finding the user has
 * marked resolved ages out, and its clock starts at the resolution.
 */
export async function pruneExpired(db: OkolosDatabase, nowMs: number): Promise<void> {
  for (const entry of await db.getAll('journal')) {
    if (olderThan(entry.createdAt, RETENTION_DAYS.journal, nowMs)) {
      await db.delete('journal', entry.id)
    }
  }

  for (const entry of await db.getAll('outbound_log')) {
    if (olderThan(entry.createdAt, RETENTION_DAYS.outbound_log, nowMs)) {
      await db.delete('outbound_log', entry.id)
    }
  }

  for (const finding of await db.getAll('findings')) {
    if (finding.resolvedAt === null) continue
    if (olderThan(finding.resolvedAt, RETENTION_DAYS.resolvedFinding, nowMs)) {
      await db.delete('findings', finding.id)
    }
  }
}
