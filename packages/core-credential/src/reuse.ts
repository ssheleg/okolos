/**
 * Which other sites have seen the same password.
 *
 * The index this reads was absent for two releases while the screen carried a
 * "Check reuse" control, and answering "none found" out of a store that does
 * not exist is the one wrong answer that panel must never give. The control was
 * removed rather than left lying; this is what earns it back.
 *
 * Nothing here knows what a password is. It receives an opaque tag — in the
 * extension, an HMAC taken over the digest the check already computes, keyed by
 * a random value that never leaves the device — and compares tags for equality.
 * Reuse is a question about sameness, and sameness is all this needs.
 */

export interface ReuseEntry {
  /** Opaque and stable for the same password on this device. Never a password. */
  readonly tag: string
  readonly host: string
  /** ISO date the tag was first recorded for this host. */
  readonly seenAt: string
}

export interface Reuse {
  /** Other hosts carrying the same tag, oldest first. Never includes `host`. */
  readonly elsewhere: readonly ReuseEntry[]
  /**
   * True when this device has never recorded the tag at all — which is not the
   * same as "used nowhere else", and the screen must not read it as such. A
   * fresh install knows nothing and should say so.
   */
  readonly unknown: boolean
}

/**
 * What the index can say about one tag on one host.
 *
 * `unknown` is the distinction that matters. An index with no row for this tag
 * has not established that the password is unique — it has established that it
 * has not seen it before, which is what the first use of any password looks
 * like. Merging the two is how a store with nothing in it starts reassuring
 * people.
 */
export function reuseOf(
  entries: readonly ReuseEntry[],
  tag: string,
  host: string,
): Reuse {
  const matching = entries.filter((entry) => entry.tag === tag)
  const elsewhere = matching
    .filter((entry) => entry.host !== host)
    .slice()
    .sort((a, b) => a.seenAt.localeCompare(b.seenAt))

  return { elsewhere, unknown: matching.length === 0 }
}

/**
 * The index after this submission, with no duplicate rows for one host.
 *
 * The first date is kept rather than the latest: "you have used this here since
 * March" is a fact about the password, and overwriting it every time the user
 * logs in would quietly turn the index into a record of when they last visited
 * a site — which is browsing history, and this product does not keep that.
 */
export function recordUse(
  entries: readonly ReuseEntry[],
  entry: ReuseEntry,
): readonly ReuseEntry[] {
  const already = entries.some((row) => row.tag === entry.tag && row.host === entry.host)
  return already ? entries : [...entries, entry]
}
