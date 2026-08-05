import { classifyUndecided, detectHidden } from '@okolos/core-injection'
import { detectPlatform } from '@okolos/platform'
import { buildRules, matchUrl, type FeedSnapshot } from '@okolos/core-feeds'
import { createOnnxRuntime, MODEL } from '@okolos/model'
import { createModelCache, openDb, pruneExpired } from '@okolos/storage'
import type {
  Envelope,
  GateDecision,
  PageCandidates,
  RpcMap,
  RpcType,
  Verdict,
} from '@okolos/contracts'

import { createInferenceHost } from './inference.js'

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
    case 'rules/refresh':
      return refreshBlockRules() as Promise<RpcMap[T]['res']>
    case 'block/context':
      return blockContext() as Promise<RpcMap[T]['res']>
    case 'block/allow':
      return allowBlocked(message.payload as { url: string }) as Promise<RpcMap[T]['res']>
    case 'gate/decision':
      return handleGateDecision(message.payload as GateDecision) as Promise<RpcMap[T]['res']>
    default:
      // Unknown types are answered by the adapter, not thrown here: a version
      // skew must not turn into a broken page.
      return undefined
  }
})

/**
 * The classifier host.
 *
 * It prepares itself once per wake-up and reports honestly why it is
 * unavailable when it is: no place to run a model, no weights the user agreed
 * to fetch, or no runtime bundled. Today the last of those is the real answer —
 * the weights carry a licence question that is the operator's to settle — so
 * stage 3 never fires and nothing above it claims otherwise.
 */
const inference = createInferenceHost({
  ensureHost: () => platform.inference.ensureHost(),
  weights: async () => {
    try {
      const db = await openDb()
      const cache = createModelCache({ db, now: () => new Date().toISOString() })
      return await cache.read(MODEL.id, MODEL.version)
    } catch {
      return null
    }
  },
  runtime: createOnnxRuntime,
  remoteScore: async (text) => {
    const response = await platform.runtime.send('inference/score', { text })
    return response?.score ?? null
  },
  log: (message) => console.warn(message),
})

/**
 * Prepared per wake-up, not per page. Chrome tears the worker down after about
 * thirty seconds of quiet, so this runs again on the next message — which is
 * also what makes a model installed mid-session take effect without a restart.
 */
const prepared = inference.prepare().catch(() => 'no-host' as const)


async function handleCandidates(page: PageCandidates): Promise<{ verdicts: Verdict[] }> {
  const now = new Date().toISOString()
  const ctx = { now, newId: () => crypto.randomUUID() }
  const verdicts = detectHidden(page, ctx)
  await prepared

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

/**
 * Blocking happens in the network layer, not after the page has rendered — a
 * page stopped after render has already run its scripts and started its timer.
 * That means declarativeNetRequest rules, rebuilt whenever the feed or the
 * user's exceptions change.
 */
const PHISHING_FEED = 'phishing'
const INTERSTITIAL = '/interstitial.html'

/** What the interstitial asks about. Lost on worker teardown, which is fine:
 * the page asks again on load, and a missing answer is shown as unknown rather
 * than guessed. */
let lastBlock: { url: string; feed: string | null; entryDate: string | null } | null = null

async function currentFeed(): Promise<FeedSnapshot | null> {
  try {
    const db = await openDb()
    const row = await db.get('feeds', PHISHING_FEED)
    return row
      ? { name: row.name, version: row.version, updatedAt: row.updatedAt, entries: row.entries }
      : null
  } catch {
    return null
  }
}

export async function refreshBlockRules(): Promise<{ installed: number; dropped: number }> {
  const feed = await currentFeed()
  if (!feed) return { installed: 0, dropped: 0 }

  const db = await openDb()
  const exceptions = (await db.getAll('exceptions'))
    .filter((row) => row.scope === 'domain')
    .map((row) => row.ref)

  const set = buildRules(feed, exceptions, INTERSTITIAL)
  await platform.blocking.replaceRules(set.rules)

  if (set.dropped > 0) {
    // A silently enforced subset reads as full protection. It is not.
    await db.put('journal', {
      id: `feed:truncated:${new Date().toISOString()}`,
      createdAt: new Date().toISOString(),
      kind: 'error',
      detail: {
        explain: `${set.dropped} entries from ${feed.name} could not be enforced: the browser limits how many blocking rules an extension may install.`,
        feed: feed.name,
      },
    })
  }

  return { installed: set.rules.length, dropped: set.dropped }
}

async function blockContext(): Promise<{
  url: string
  feed: string | null
  entryDate: string | null
  feedAgeDays: number | null
} | null> {
  if (!lastBlock) return null
  const feed = await currentFeed()
  const ageDays = feed
    ? Math.floor((Date.now() - Date.parse(feed.updatedAt)) / 86_400_000)
    : null
  return {
    url: lastBlock.url,
    feed: lastBlock.feed,
    entryDate: lastBlock.entryDate,
    feedAgeDays: Number.isFinite(ageDays) ? ageDays : null,
  }
}

async function allowBlocked(payload: { url: string }): Promise<{ url: string } | null> {
  const target = payload.url
  if (!target) return null

  let host: string
  try {
    host = new URL(target).hostname
  } catch {
    return null
  }

  try {
    const db = await openDb()
    await db.put('exceptions', {
      scope: 'domain',
      ref: host,
      createdAt: new Date().toISOString(),
      reason: 'continued past a block',
    })
    await db.put('journal', {
      id: `exception:${host}:${new Date().toISOString()}`,
      createdAt: new Date().toISOString(),
      kind: 'action',
      detail: { explain: `You chose to keep visiting ${host} after it was blocked.`, reason: 'user-allowed' },
    })
    await refreshBlockRules()
  } catch (cause) {
    // Without a recorded exception the next visit is blocked again. Saying so
    // beats sending the user back into a loop they cannot escape.
    console.warn('okolos: could not record the exception', cause)
    return null
  }

  return { url: target }
}

platform.blocking.onBlocked((url) => {
  void (async () => {
    const feed = await currentFeed()
    const match = feed ? matchUrl(url, feed) : null
    lastBlock = {
      url,
      feed: match?.feed ?? null,
      entryDate: match?.updatedAt?.slice(0, 10) ?? null,
    }
  })()
})

void refreshBlockRules().catch(() => undefined)

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
