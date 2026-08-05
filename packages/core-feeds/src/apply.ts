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
  | 'bad-signature'
  | 'wrong-base'
  | 'no-current'
  | 'not-newer'
  | 'wrong-feed'

export type UpdateOutcome =
  | { readonly accepted: true; readonly snapshot: FeedSnapshot }
  | {
      readonly accepted: false
      readonly reason: RefusalReason
      /** What remains in force. Null only when there was never a good snapshot. */
      readonly kept: FeedSnapshot | null
      readonly explain: string
    }

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

export async function applyUpdate(
  current: FeedSnapshot | null,
  signed: SignedUpdate,
  verify: Verifier,
): Promise<UpdateOutcome> {
  const refuse = (reason: RefusalReason, explain: string): UpdateOutcome => ({
    accepted: false,
    reason,
    kept: current,
    explain,
  })

  if (!(await verify(serialiseUpdate(signed.update), signed.signature))) {
    return refuse(
      'bad-signature',
      current
        ? `The ${signed.update.body.name} update was not signed by the expected key; version ${current.version} stays in force.`
        : `The ${signed.update.body.name} update was not signed by the expected key, and there is no earlier copy to fall back to.`,
    )
  }

  if (current && current.name !== signed.update.body.name) {
    return refuse(
      'wrong-feed',
      `That update is for ${signed.update.body.name}, not ${current.name}.`,
    )
  }

  if (current && signed.update.body.version <= current.version) {
    // A correctly signed old update, replayed, is how a fixed entry gets
    // un-fixed. The signature being valid is exactly why this check exists.
    return refuse(
      'not-newer',
      `Version ${signed.update.body.version} is not newer than the ${current.version} already in force.`,
    )
  }

  if (signed.update.kind === 'snapshot') {
    return { accepted: true, snapshot: signed.update.body }
  }

  const delta = signed.update.body
  if (!current) {
    return refuse(
      'no-current',
      `A delta cannot be applied without a full ${delta.name} feed to apply it to.`,
    )
  }

  if (delta.base !== current.version) {
    return refuse(
      'wrong-base',
      `That delta was built against version ${delta.base}, but ${current.version} is in force.`,
    )
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
