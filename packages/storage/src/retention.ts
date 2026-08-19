import type { OkolosDatabase } from './db.js'
import { RETENTION_DAYS } from './schema.js'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Whether a record has outlived its window — and an unreadable date counts as
 * outlived, not as immortal.
 *
 * The first version read `Number.isFinite(at) && …`, so a row whose `createdAt`
 * could not be parsed was never deleted by anything, ever. Measured: after a sweep
 * the corrupt row was the one still there and the valid old one was gone. A record
 * whose age cannot be established cannot be held under a promise about age, and
 * `dueForSweep` two functions down already decided this the same way — "an
 * unreadable timestamp is not permission to skip". Deleting costs a row nobody can
 * date; keeping it breaks the only sentence the privacy page makes about time.
 */
function olderThan(iso: string, days: number, nowMs: number): boolean {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return true
  return nowMs - at > days * DAY_MS
}

/** Whether a deferral's own deadline has passed, so the row is spent. */
function pastDeadline(iso: unknown, nowMs: number): boolean {
  if (typeof iso !== 'string') return true
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return true
  return at <= nowMs
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

  /**
   * `settings` holds bookkeeping and two kinds of row that accumulate.
   *
   * It was swept by nothing, which is how `seen:<host>` became a permanent
   * timestamped list of every site where a password or card field was focused —
   * the browsing history this product declined the `history` permission to avoid
   * having. The rest of the store is bookkeeping that is overwritten in place
   * (`popup:lastCheck`, the sweep's own timestamp) or a value that must outlive any
   * window: `reuse:key` cannot expire without orphaning every tag it made, and the
   * user's own HIBP credential is theirs to remove.
   */
  for (const setting of await db.getAll('settings')) {
    if (setting.key.startsWith('seen:')) {
      if (typeof setting.value !== 'string' || olderThan(setting.value, RETENTION_DAYS.seenHost, nowMs)) {
        await db.delete('settings', setting.key)
      }
      continue
    }

    // A deferral is spent the moment its own deadline passes: the popup stops
    // hiding the finding, and the row goes on saying "not now" about a moment
    // that is over.
    if (setting.key.startsWith('defer:') && pastDeadline(setting.value, nowMs)) {
      await db.delete('settings', setting.key)
    }
  }
}
