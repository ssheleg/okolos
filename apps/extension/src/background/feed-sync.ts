
import { t } from '@okolos/i18n'
import { request, type RequestDeps } from '@okolos/net'
import type { SignedUpdate } from '@okolos/core-feeds'

import { PROXY_ORIGIN } from '../config.js'

/**
 * Fetching the blocking feed, and the reason this file had to exist.
 *
 * Everything downstream was built and tested: `updateFeed` verifies an Ed25519
 * signature, refuses a replay and keeps the last good snapshot; `buildRules`
 * turns a snapshot into blocking rules; `refreshBlockRules` installs them. The
 * background read the feed out of storage on every rules refresh.
 *
 * Nothing ever put one in. `updateFeed` had no caller outside its own tests, so
 * the `feeds` store was empty on every install, `currentFeed()` returned null,
 * and the number of blocking rules was always zero. REQ-13 and REQ-14 were
 * closed on a path that ran end to end only in a test that seeded storage by
 * hand.
 */

/** Where the signed feed comes from. The worker serves it; the key verifies it. */
export const FEED_URL = `${PROXY_ORIGIN}/feeds/phishing`

export interface FeedSyncDeps {
  readonly audit: RequestDeps
  /** Applies a verified update and reports what happened. */
  readonly apply: (signed: SignedUpdate) => Promise<{ accepted: boolean; reason?: string }>
  /** Rebuilds blocking rules from whatever is now in force. */
  readonly refresh: () => Promise<unknown>
  /**
   * Says what happened, in the journal a user can read — as a key and its
   * arguments, never as a finished sentence. The journal is a record, and a
   * record written in whichever language was active that day has stopped
   * being one record.
   */
  readonly note: (explainKey: string, ...explainArgs: string[]) => Promise<void>
}

/**
 * What each outcome is recorded as. A table rather than three positional
 * strings, because `tools/locales.test.ts` reads `t('…')`, `*_KEY` tables and
 * `…Key:` fields and deliberately nothing looser — a key handed in as a bare
 * argument reads to it as translated-and-never-shown, and it is right to.
 */
const NOTE_KEY = {
  status: 'feedFetchStatus',
  failed: 'feedFetchFailed',
  refused: 'feedRefused',
} as const

export interface FeedSyncResult {
  readonly fetched: boolean
  readonly accepted: boolean
  readonly why?: string
}

/**
 * Pulls the feed once and applies it if it verifies.
 *
 * Every failure is a stated one. A feed that cannot be fetched, cannot be
 * parsed, or does not verify leaves the last good snapshot in force — which is
 * the behaviour `applyUpdate` was written for and which nothing was exercising.
 */
export async function syncFeed(deps: FeedSyncDeps): Promise<FeedSyncResult> {
  let signed: SignedUpdate
  try {
    const response = await request(
      {
        url: FEED_URL,
        method: 'GET',
        purpose: 'feed-update',
        payloadShape: 'none',
        triggeredBy: 'alarm:feeds',
      },
      deps.audit,
    )
    if (!response.ok) {
      await deps.note(NOTE_KEY.status, String(response.status))
      return { fetched: false, accepted: false, why: `status ${response.status}` }
    }
    signed = (await response.json()) as SignedUpdate
  } catch (cause) {
    await deps.note(NOTE_KEY.failed, String(cause))
    return { fetched: false, accepted: false, why: String(cause) }
  }

  const outcome = await deps.apply(signed)
  if (!outcome.accepted) {
    // A refused update is the guard working, and the user should be able to
    // read that it happened — a signature that stopped verifying is exactly
    // the event worth seeing in a journal.
    await deps.note(NOTE_KEY.refused, outcome.reason ?? t('feedNotVerified'))
    return { fetched: true, accepted: false, why: outcome.reason ?? 'refused' }
  }

  await deps.refresh()
  return { fetched: true, accepted: true }
}
