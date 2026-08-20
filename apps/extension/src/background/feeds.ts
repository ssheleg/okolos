import { feedAccepted, feedRefusal } from './feed-words.js'
import { applyUpdate, type FeedSnapshot, type SignedUpdate, type Verifier } from '@okolos/core-feeds'
import type { OkolosDatabase } from '@okolos/storage'

/**
 * The host side of feed updates: a real signature check and a place to keep
 * what was verified.
 *
 * The key is compiled in rather than fetched. A key delivered over the same
 * channel as the feed protects nothing — whoever can replace one can replace
 * both — so rotating it is a release, deliberately.
 */

/** Ed25519 public key of the feed publisher, raw bytes, base64. */
export const FEED_PUBLIC_KEY = 'JHUePa03XAoSeQcJjNljgDESMhBI/ZG03zoOfm/vapM='

/**
 * The primitive the verifier uses, named once so a gate can read it.
 *
 * `tools/manifest.test.ts` matches this against the minimum browser versions the
 * manifests declare. The two drifted apart already: the design named
 * `@noble/ed25519`, which runs anywhere; the implementation moved to WebCrypto,
 * which needs Chrome 137 and Firefox 129; and the manifests kept saying 116 and
 * 128. On that range every update was refused, `currentFeed()` stayed null, and
 * the number of blocking rules was zero — the exact failure this module's own
 * header describes as fixed, arrived at by a different road.
 */
export const SIGNATURE_ALGORITHM = 'Ed25519'

/**
 * Whether this engine can check a feed signature at all.
 *
 * Separate from the verifier, and asked before the fetch, because "cannot check"
 * and "did not check out" are different answers and only one of them is about the
 * publisher. `Verifier` returns a boolean, so it collapses them: an engine
 * without Ed25519 produced `false`, `applyUpdate` reported `bad-signature`, and
 * the journal told the reader the list had not been signed by the expected key.
 * That is a check that never ran being reported as a check that failed, which is
 * the one thing ADR-0004 exists to forbid.
 *
 * Probed with the real key, since a key this engine cannot import is the same
 * unusable state as an algorithm it does not know. Cached, because the answer
 * cannot change inside one worker lifetime — and cached *per key*, because a
 * cache that ignores its own argument answers the second caller's question with
 * the first caller's result. The first version of this held one boolean and did
 * exactly that.
 */
const capable = new Map<string, Promise<boolean>>()

export function canVerify(publicKeyBase64: string = FEED_PUBLIC_KEY): Promise<boolean> {
  const cached = capable.get(publicKeyBase64)
  if (cached) return cached
  // `bytesOf` sits inside the async body, not in the expression that builds the
  // promise: `atob` throws synchronously on anything that is not base64, and a
  // synchronous throw here reaches the caller instead of becoming the "no" this
  // function exists to give. The caller is a background alarm, so that throw
  // would have landed in `pullFeed`'s outer catch as a `console.warn` — and the
  // honest journal entry, the entire point of asking, would never be written.
  // Its own test caught this before the first commit.
  const probe = (async () => {
    try {
      await crypto.subtle.importKey(
        'raw',
        bytesOf(publicKeyBase64),
        { name: SIGNATURE_ALGORITHM },
        false,
        ['verify'],
      )
      return true
    } catch {
      return false
    }
  })()
  capable.set(publicKeyBase64, probe)
  return probe
}

export function createVerifier(publicKeyBase64: string): Verifier {
  let imported: Promise<CryptoKey> | null = null

  const key = () => {
    imported ??= crypto.subtle.importKey(
      'raw',
      bytesOf(publicKeyBase64),
      { name: SIGNATURE_ALGORITHM },
      false,
      ['verify'],
    )
    return imported
  }

  return async (serialised, signature) => {
    try {
      return await crypto.subtle.verify(
        { name: SIGNATURE_ALGORITHM },
        await key(),
        bytesOf(signature),
        new TextEncoder().encode(serialised),
      )
    } catch {
      // An unusable key or a malformed signature: both mean "not verified", and
      // neither means "fine". The third case that used to land here — an engine
      // that does not know the algorithm — is answered by `canVerify` before the
      // fetch, because collapsing it into `false` made the journal accuse the
      // publisher of not signing a list this browser simply could not read.
      return false
    }
  }
}

function bytesOf(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const buffer = new ArrayBuffer(binary.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i += 1) view[i] = binary.charCodeAt(i)
  return buffer
}

export async function readFeed(db: OkolosDatabase, name: string): Promise<FeedSnapshot | null> {
  const row = await db.get('feeds', name)
  return row ? { name: row.name, version: row.version, updatedAt: row.updatedAt, entries: row.entries } : null
}

export interface FeedUpdateResult {
  readonly inForce: FeedSnapshot | null
  readonly accepted: boolean
  /**
   * A catalogue key and its arguments, not a sentence.
   *
   * The journal keeps this and `summarise` resolves it when somebody reads it, so a
   * reader who switches language sees their own words on old rows (B-75). A sentence
   * stored here would freeze the language in force when the feed happened to update.
   */
  readonly explainKey: string
  readonly explainArgs: readonly string[]
}

/**
 * Applies an update and keeps whatever ends up in force. A refusal is written
 * to the journal rather than swallowed: a feed that quietly stopped updating
 * looks exactly like one with nothing new to say.
 */
export async function updateFeed(
  db: OkolosDatabase,
  signed: SignedUpdate,
  verify: Verifier,
  now: () => string,
): Promise<FeedUpdateResult> {
  const name = signed.update.body.name
  const current = await readFeed(db, name)
  const outcome = await applyUpdate(current, signed, verify)

  if (!outcome.accepted) {
    const explained = feedRefusal(outcome, outcome.kept)
    await db.put('journal', {
      id: `feed:${name}:${now()}`,
      createdAt: now(),
      kind: 'error',
      detail: { ...explained, reason: outcome.reason, feed: name },
    })
    return { inForce: outcome.kept, accepted: false, ...explained }
  }

  await db.put('feeds', {
    name: outcome.snapshot.name,
    version: outcome.snapshot.version,
    updatedAt: outcome.snapshot.updatedAt,
    storedAt: now(),
    entries: [...outcome.snapshot.entries],
  })

  return {
    inForce: outcome.snapshot,
    accepted: true,
    ...feedAccepted(name, outcome.snapshot.version),
  }
}
