import type { OkolosDatabase } from './db.js'
import { RETENTION_DAYS } from './schema.js'

const DAY_MS = 24 * 60 * 60 * 1000

function olderThan(iso: string, days: number, nowMs: number): boolean {
  const at = Date.parse(iso)
  return Number.isFinite(at) && nowMs - at > days * DAY_MS
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
