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
export const FEED_PUBLIC_KEY = 'REPLACE_AT_RELEASE_WITH_THE_PUBLISHERS_ED25519_KEY'

export function createVerifier(publicKeyBase64: string): Verifier {
  let imported: Promise<CryptoKey> | null = null

  const key = () => {
    imported ??= crypto.subtle.importKey(
      'raw',
      bytesOf(publicKeyBase64),
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
    return imported
  }

  return async (serialised, signature) => {
    try {
      return await crypto.subtle.verify(
        { name: 'Ed25519' },
        await key(),
        bytesOf(signature),
        new TextEncoder().encode(serialised),
      )
    } catch {
      // An unusable key, a malformed signature, a browser without Ed25519:
      // every one of them means "not verified", and none of them means "fine".
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
  readonly explain: string
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
    await db.put('journal', {
      id: `feed:${name}:${now()}`,
      createdAt: now(),
      kind: 'error',
      detail: { explain: outcome.explain, reason: outcome.reason, feed: name },
    })
    return { inForce: outcome.kept, accepted: false, explain: outcome.explain }
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
    explain: `${name} is now at version ${outcome.snapshot.version}.`,
  }
}
