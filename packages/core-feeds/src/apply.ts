/**
 * Taking a feed update, and refusing one.
 *
 * A feed decides whether someone's page gets blocked, so the update path is the
 * most attackable surface this product has: whoever can replace a feed can
 * block any site or unblock a malicious one. Three rules follow, and all three
 * are about what happens when something is wrong rather than when it is right.
 *
 *   - An update that does not verify is refused, and the last verified snapshot
 *     stays in force. Failing to a *previous good state* is the whole point;
 *     failing to an empty feed would silently turn protection off.
 *   - A delta is applied only onto the exact version it was built against.
 *     Applying one across a gap produces a feed nobody has ever tested.
 *   - Versions never go backwards. A replayed old update — a genuine, correctly
 *     signed one, served again by someone in the middle — is how a fixed entry
 *     gets un-fixed.
 *
 * Signature checking is injected, not imported: the verifier belongs to the
 * host, and this file has no business knowing whether it came from WebCrypto.
 */

export interface FeedSnapshot {
  readonly name: string
  readonly version: number
  readonly updatedAt: string
  /** Already normalised by the publisher; `normaliseEntry` is applied on lookup. */
  readonly entries: readonly string[]
}

export interface FeedDelta {
  readonly name: string
  /** The version this delta was built against. Anything else is refused. */
  readonly base: number
  readonly version: number
  readonly updatedAt: string
  readonly added: readonly string[]
  readonly removed: readonly string[]
}

export type FeedUpdate =
  | { readonly kind: 'snapshot'; readonly body: FeedSnapshot }
  | { readonly kind: 'delta'; readonly body: FeedDelta }

export interface SignedUpdate {
  readonly update: FeedUpdate
  /** Detached signature over the canonical serialisation of `update`. */
  readonly signature: string
}

/** Returns true only when the signature is valid for this exact body. */
export type Verifier = (serialised: string, signature: string) => Promise<boolean>

export type RefusalReason =
  | 'bad-version'
  | 'bad-signature'
  | 'wrong-base'
  | 'no-current'
  | 'not-newer'
  | 'wrong-feed'

/**
 * A refusal, in the values a sentence about it needs.
 *
 * Each reason arrived with `explain` beside it: one finished English sentence, composed
 * in a package with no catalogue, journalled and shown (B-75). The reason was already
 * the code and the sentence restated it, so the sentence is gone rather than moved —
 * `feedRefusal` in `apps/extension/src/background/feed-words.ts` writes the words.
 *
 * A union rather than a bag of optional fields: `wrong-base` without the two versions
 * it compared is a sentence with a hole in it, and the compiler should say so.
 */
export type Refusal =
  /** Signed by something else. `kept` says whether anything survives to fall back on. */
  | { readonly reason: 'bad-signature'; readonly feed: string }
  /** Something that is not a version number where one belongs. */
  | { readonly reason: 'bad-version'; readonly feed: string; readonly found: string }
  /** An update for one feed offered as another's. */
  | { readonly reason: 'wrong-feed'; readonly feed: string; readonly current: string }
  /** A correctly signed old update, replayed. */
  | { readonly reason: 'not-newer'; readonly version: number; readonly current: number }
  /** A delta with nothing to apply it to. */
  | { readonly reason: 'no-current'; readonly feed: string }
  /** A delta built against a version that is not the one in force. */
  | { readonly reason: 'wrong-base'; readonly base: number; readonly current: number }

export type UpdateOutcome =
  | { readonly accepted: true; readonly snapshot: FeedSnapshot }
  | ({
      readonly accepted: false
      /** What remains in force. Null only when there was never a good snapshot. */
      readonly kept: FeedSnapshot | null
    } & Refusal)

/**
 * The exact bytes the publisher signed.
 *
 * Written out by hand rather than left to `JSON.stringify`, because the order
 * of keys in an object literal is incidental and a signature over a
 * differently-ordered serialisation of the same feed would not verify. Arrays
 * keep their order: the publisher signs one arrangement of entries, and a
 * reordering is a different document.
 */
export function serialiseUpdate(update: FeedUpdate): string {
  return canonical({ kind: update.kind, body: update.body })
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }

  return JSON.stringify(value) ?? 'null'
}

/**
 * A version this code can order against another.
 *
 * Non-negative, whole, and inside the range where arithmetic still
 * distinguishes neighbours — past 2^53 "newer" stops meaning anything, and
 * `MAX_SAFE_INTEGER` would leave no version above it at all.
 */
function isUsableVersion(version: number): boolean {
  return Number.isSafeInteger(version) && version >= 0 && version < Number.MAX_SAFE_INTEGER
}

export async function applyUpdate(
  current: FeedSnapshot | null,
  signed: SignedUpdate,
  verify: Verifier,
): Promise<UpdateOutcome> {
  const refuse = (refusal: Refusal): UpdateOutcome => ({
    accepted: false,
    kept: current,
    ...refusal,
  })

  if (!(await verify(serialiseUpdate(signed.update), signed.signature))) {
    // Whether anything survives to fall back on is `kept`, which every refusal carries;
    // it used to be a second sentence chosen here.
    return refuse({ reason: 'bad-signature', feed: signed.update.body.name })
  }

  // Before any comparison, because the comparison is what fails. `version <=
  // current.version` is false for NaN, so a NaN sails past the replay guard —
  // and once NaN is what is in force, every later update passes the same
  // check, including a replay of an entry that was fixed. The guard cannot
  // recover on its own, because the guard is what broke.
  if (!isUsableVersion(signed.update.body.version)) {
    return refuse({
      reason: 'bad-version',
      feed: signed.update.body.name,
      found: String(signed.update.body.version),
    })
  }

  if (current && current.name !== signed.update.body.name) {
    return refuse({
      reason: 'wrong-feed',
      feed: signed.update.body.name,
      current: current.name,
    })
  }

  // A stored version that is not usable means an earlier build let one in.
  // Skipping the comparison against it is the only way back: every comparison
  // against NaN is false, so nothing would ever be newer and nothing ever
  // refused.
  if (current && isUsableVersion(current.version) && signed.update.body.version <= current.version) {
    // A correctly signed old update, replayed, is how a fixed entry gets
    // un-fixed. The signature being valid is exactly why this check exists.
    return refuse({
      reason: 'not-newer',
      version: signed.update.body.version,
      current: current.version,
    })
  }

  if (signed.update.kind === 'snapshot') {
    return { accepted: true, snapshot: signed.update.body }
  }

  const delta = signed.update.body
  if (!current) {
    return refuse({ reason: 'no-current', feed: delta.name })
  }

  if (delta.base !== current.version) {
    return refuse({ reason: 'wrong-base', base: delta.base, current: current.version })
  }

  const removed = new Set(delta.removed)
  const entries = [...current.entries.filter((entry) => !removed.has(entry)), ...delta.added]

  return {
    accepted: true,
    snapshot: {
      name: current.name,
      version: delta.version,
      updatedAt: delta.updatedAt,
      entries: [...new Set(entries)],
    },
  }
}
