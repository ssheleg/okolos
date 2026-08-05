import { classifyUndecided, detectHidden, type InferenceHost } from '@okolos/core-injection'
import { detectPlatform } from '@okolos/platform'
import { openDb, pruneExpired } from '@okolos/storage'
import type {
  Envelope,
  GateDecision,
  PageCandidates,
  RpcMap,
  RpcType,
  Verdict,
} from '@okolos/contracts'

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
    case 'gate/decision':
      return handleGateDecision(message.payload as GateDecision) as Promise<RpcMap[T]['res']>
    default:
      // Unknown types are answered by the adapter, not thrown here: a version
      // skew must not turn into a broken page.
      return undefined
  }
})

/**
 * The classifier host. No model ships yet, so it reports itself unavailable and
 * stage 3 skips entirely — which is the same code path a device without WebGPU
 * will take, exercised on every run rather than only in a test.
 *
 * The ONNX session lands with REQ-36; nothing above it changes when it does.
 */
const inference: InferenceHost = {
  available: () => false,
  score: () => Promise.reject(new Error('no model installed')),
}

async function handleCandidates(page: PageCandidates): Promise<{ verdicts: Verdict[] }> {
  const now = new Date().toISOString()
  const ctx = { now, newId: () => crypto.randomUUID() }
  const verdicts = detectHidden(page, ctx)

  // Stage 3 sees only what the rules left undecided.
  const decidedLocators = verdicts.flatMap((v) => v.evidence.map((e) => e.locator ?? ''))
  verdicts.push(...(await classifyUndecided(page, decidedLocators, inference, ctx)))

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

/**
 * A held action is journalled here rather than in the page, because the page is
 * the thing under suspicion. Whether the user allowed it or blocked it, the
 * record survives the tab that produced it.
 */
async function handleGateDecision(decision: GateDecision): Promise<{ ok: true }> {
  try {
    const db = await openDb()
    await db.put('journal', {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      kind: 'action',
      detail: {
        actionId: decision.actionId,
        outcome: decision.outcome,
        reason: decision.reason,
        findings: decision.findingIds.join(','),
        explain: decision.explain,
      },
    })
  } catch (cause) {
    // The decision was already enforced in the page; losing the record is bad
    // but not dangerous, and saying so beats pretending it was written.
    console.warn('okolos: could not journal a gate decision', cause)
  }
  return { ok: true }
}

// Through the adapter, like everything else. Reaching for chrome.* directly
// here is the same mistake that silently broke the content script in Firefox,
// and it is easiest to make in exactly this kind of one-line wiring.
platform.runtime.onInstalled(() => {
  void platform.tabs.create(platform.runtime.getUrl('first-run.html'))
})

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
