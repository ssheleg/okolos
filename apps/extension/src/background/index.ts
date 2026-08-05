import { detectHidden } from '@okolos/core-injection'
import { detectPlatform } from '@okolos/platform'
import { openDb, pruneExpired } from '@okolos/storage'
import type { Envelope, PageCandidates, RpcMap, RpcType, Verdict } from '@okolos/contracts'

/**
 * The background context holds no state between wake-ups.
 *
 * Chrome tears its service worker down after about thirty seconds of quiet, so
 * anything kept in a module variable is gone by the next message. Everything
 * that must survive goes to IndexedDB, and every schedule goes through alarms.
 */

const platform = detectPlatform()
const RETENTION_ALARM = 'okolos:retention'

platform.runtime.onMessage(<T extends RpcType>(message: Envelope<T>) => {
  switch (message.type) {
    case 'page/candidates':
      return handleCandidates(message.payload as PageCandidates) as Promise<RpcMap[T]['res']>
    default:
      // Unknown types are answered by the adapter, not thrown here: a version
      // skew must not turn into a broken page.
      return undefined
  }
})

async function handleCandidates(page: PageCandidates): Promise<{ verdicts: Verdict[] }> {
  const now = new Date().toISOString()
  const verdicts = detectHidden(page, { now, newId: () => crypto.randomUUID() })

  if (verdicts.length > 0) {
    try {
      const db = await openDb()
      for (const verdict of verdicts) {
        await db.put('findings', {
          id: verdict.id,
          createdAt: verdict.createdAt,
          subject: `${verdict.subject.kind}:${verdict.subject.ref}`,
          resolvedAt: null,
          verdict,
        })
      }
    } catch (cause) {
      // Storing the finding is best-effort; warning the user is not. If the
      // database is unavailable the verdict still goes back to the page.
      console.warn('okolos: could not persist findings', cause)
    }
  }

  return { verdicts }
}

void platform.alarms.create(RETENTION_ALARM, 60 * 24)
platform.alarms.onFired((name) => {
  if (name !== RETENTION_ALARM) return
  void (async () => {
    try {
      const db = await openDb()
      await pruneExpired(db, Date.now())
    } catch (cause) {
      console.warn('okolos: retention sweep failed', cause)
    }
  })()
})
