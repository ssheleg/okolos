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

import { handleDownload } from './downloads.js'
import { reviewInventory } from './extensions.js'
import { CAVALIER, hibp, lookupLeaks } from './leaks.js'
import { checkSubmittedPassword } from './password.js'
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
const INVENTORY_ALARM = 'okolos:inventory'

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
    case 'password/check':
      return handlePasswordCheck(message.payload as { sha1: string }) as Promise<RpcMap[T]['res']>
    case 'leaks/check':
      return handleLeakCheck(message.payload as { address: string }) as Promise<RpcMap[T]['res']>
    case 'extensions/state':
      return extensionsState() as Promise<RpcMap[T]['res']>
    case 'extensions/disable':
      return disableExtension(message.payload as { id: string }) as Promise<RpcMap[T]['res']>
    case 'extensions/trust':
      return trustExtensionChange(message.payload as { id: string }) as Promise<RpcMap[T]['res']>
    case 'site/facts':
      return siteFacts(message.payload as { host: string }) as Promise<RpcMap[T]['res']>
    case 'trap/warned':
      return journalTrap(message.payload as { kind: string; signals: string }) as Promise<RpcMap[T]['res']>
    case 'recovery/open':
      return openRecovery(message.payload as { kind: string }) as Promise<RpcMap[T]['res']>
    case 'trust/list':
      return listTrusted() as Promise<RpcMap[T]['res']>
    case 'trust/add':
      return addTrusted(message.payload as { domain: string }) as Promise<RpcMap[T]['res']>
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

/**
 * What this device knows about a host, and nothing more.
 *
 * The first visit is recorded here rather than read from browsing history: the
 * history permission would give this extension every page the user has ever
 * opened, to answer a question that only needs one date per domain.
 */
/** Everything that may leave the device goes through this, and is logged first. */
async function auditDeps() {
  const db = await openDb()
  return {
    writeAudit: async (entry: Parameters<typeof db.put>[1]) => {
      await db.put('outbound_log', entry as never)
    },
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
  }
}

async function handlePasswordCheck(payload: { sha1: string }): Promise<{
  compromised: boolean
  count: number | null
  offline: boolean
  explain: string
}> {
  const verdict = await checkSubmittedPassword(payload.sha1, await auditDeps())
  return {
    compromised: verdict.compromised,
    count: verdict.count,
    offline: verdict.offline,
    explain: verdict.explain,
  }
}

async function handleLeakCheck(payload: { address: string }) {
  const key = await readSetting('hibp:apiKey')
  const inventory = await lookupLeaks(
    payload.address,
    [hibp(typeof key === 'string' && key ? key : null), CAVALIER],
    await auditDeps(),
  )
  return {
    leaks: inventory.leaks.map((leak) => ({ ...leak, classes: [...leak.classes] })),
    sources: inventory.sources.map((source) => ({ ...source })),
    complete: inventory.complete,
    coverage: inventory.coverage,
  }
}

async function readSetting(key: string): Promise<unknown> {
  try {
    const db = await openDb()
    return (await db.get('settings', key))?.value ?? null
  } catch {
    return null
  }
}

async function extensionsState() {
  if (!platform.extensions.available()) {
    return { supported: false, changes: [], installed: [] }
  }

  // The review is run here rather than read from a cache: opening the screen is
  // exactly the moment the user wants the current answer, and the comparison is
  // cheap next to the wait they would otherwise not understand.
  const changes = await reviewInventory({
    db: await openDb(),
    list: () => platform.extensions.list(),
    now: () => new Date().toISOString(),
    selfId: platform.extensions.selfId(),
  }).catch(() => [])

  const installed = (await platform.extensions.list()).filter(
    (entry) => entry.id !== platform.extensions.selfId(),
  )

  return {
    supported: true,
    changes: changes.map((change) => ({ ...change })),
    installed: installed.map((entry) => ({
      id: entry.id,
      name: entry.name,
      version: entry.version,
      permissions: [...entry.permissions],
      enabled: entry.enabled,
    })),
  }
}

async function disableExtension(payload: { id: string }): Promise<{ ok: boolean; why?: string }> {
  try {
    await platform.extensions.disable(payload.id)
  } catch (cause) {
    // The browser refuses for policy-installed extensions, among others. Saying
    // so beats a button that silently does nothing.
    return { ok: false, why: cause instanceof Error ? cause.message : String(cause) }
  }

  try {
    const db = await openDb()
    const now = new Date().toISOString()
    await db.put('journal', {
      id: `extension-disabled:${payload.id}:${now}`,
      createdAt: now,
      kind: 'action',
      detail: { explain: `You disabled the extension ${payload.id}.`, reason: 'user-blocked' },
    })
  } catch {
    // The extension is off either way; the record is the lesser of the two.
  }
  return { ok: true }
}

async function trustExtensionChange(payload: { id: string }): Promise<{ ok: true }> {
  try {
    const db = await openDb()
    const now = new Date().toISOString()
    await db.put('exceptions', {
      scope: 'extension',
      ref: payload.id,
      createdAt: now,
      reason: 'the user accepted this change',
    })
    await db.put('journal', {
      id: `extension-trusted:${payload.id}:${now}`,
      createdAt: now,
      kind: 'action',
      detail: { explain: `You accepted the change to extension ${payload.id}.`, reason: 'user-allowed' },
    })
  } catch (cause) {
    console.warn('okolos: could not record the accepted change', cause)
  }
  return { ok: true }
}

async function siteFacts(payload: { host: string }): Promise<{
  trusted: boolean
  firstSeen: string | null
}> {
  try {
    const db = await openDb()
    const trustedRow = await db.get('exceptions', ['domain', payload.host])
    const seen = await db.get('settings', `seen:${payload.host}`)
    const firstSeen = typeof seen?.value === 'string' ? seen.value : null

    if (!firstSeen) {
      await db.put('settings', { key: `seen:${payload.host}`, value: new Date().toISOString() })
    }

    return { trusted: Boolean(trustedRow), firstSeen }
  } catch {
    // Unknown is not the same as new: the guard is told nothing is known and
    // says so, rather than being told the site is brand new.
    return { trusted: false, firstSeen: null }
  }
}

async function journalTrap(payload: { kind: string; signals: string }): Promise<{ ok: true }> {
  const wording: Record<string, string> = {
    clickfix: 'A page copied a command and asked you to run it outside the browser.',
    techsupport: 'A page claimed your computer was locked and gave a number to call.',
  }
  try {
    const db = await openDb()
    const now = new Date().toISOString()
    await db.put('journal', {
      id: `trap:${payload.kind}:${now}`,
      createdAt: now,
      kind: 'verdict',
      detail: { explain: wording[payload.kind] ?? 'A page trap was detected.', signals: payload.signals },
    })
  } catch (cause) {
    console.warn('okolos: could not journal a page trap', cause)
  }
  return { ok: true }
}

async function openRecovery(payload: { kind: string }): Promise<{ ok: true }> {
  // The checklist itself lands with REQ-22; until then the entry point exists
  // and goes somewhere real rather than being a control that does nothing.
  await platform.tabs.create(platform.runtime.getUrl(`options.html#recovery=${encodeURIComponent(payload.kind)}`))
  return { ok: true }
}

async function listTrusted(): Promise<{ domains: string[] }> {
  try {
    const db = await openDb()
    const rows = await db.getAll('exceptions')
    return { domains: rows.filter((row) => row.scope === 'domain').map((row) => row.ref) }
  } catch {
    // An unreadable exception list means warning about sites the user already
    // approved. Noisy, but never the other way round.
    return { domains: [] }
  }
}

async function addTrusted(payload: { domain: string }): Promise<{ ok: true }> {
  try {
    const db = await openDb()
    await db.put('exceptions', {
      scope: 'domain',
      ref: payload.domain,
      createdAt: new Date().toISOString(),
      reason: 'marked legitimate by the user',
    })
    await refreshBlockRules()
  } catch (cause) {
    console.warn('okolos: could not record a trusted domain', cause)
  }
  return { ok: true }
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
void reviewExtensions()

/**
 * Downloads are judged as they are created — the only moment the bytes have not
 * landed yet. Nothing here waits on the page: a direct link has no page.
 */
platform.downloads.onCreated((item) => {
  void handleDownload(item, {
    feed: currentFeed,
    cancel: (id) => platform.downloads.cancel(id),
    journal: async (entry) => {
      const db = await openDb()
      const now = new Date().toISOString()
      await db.put('journal', {
        id: `download:${item.id}:${now}`,
        createdAt: now,
        kind: entry.outcome === 'block' ? 'verdict' : 'action',
        detail: { explain: entry.explain, outcome: entry.outcome },
      })
    },
    announce: async (verdict) => {
      // Best-effort: a download started from a page gets a banner there. One
      // started from a bookmark has no page, and the journal is the record.
      await platform.runtime
        .send('download/verdict', {
          action: verdict.action,
          headline: verdict.headline,
          reasons: verdict.reasons.join(' '),
          skipped: verdict.skipped.map((entry) => `${entry.check}: ${entry.why}`).join('; '),
        })
        .catch(() => undefined)
    },
  })
})

/**
 * The extension inventory is reviewed daily rather than on every wake-up: what
 * it looks for is an update that happened while nobody was watching, and that
 * does not need checking twice an hour.
 */
async function reviewExtensions(): Promise<void> {
  if (!platform.extensions.available()) return
  try {
    await reviewInventory({
      db: await openDb(),
      list: () => platform.extensions.list(),
      now: () => new Date().toISOString(),
      selfId: platform.extensions.selfId(),
    })
  } catch (cause) {
    console.warn('okolos: the extension review failed', cause)
  }
}

void platform.alarms.create(INVENTORY_ALARM, 60 * 24)
void platform.alarms.create(RETENTION_ALARM, 60 * 24)
platform.alarms.onFired((name) => {
  if (name === INVENTORY_ALARM) {
    void reviewExtensions()
    return
  }
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
