/**
 * Failing open without failing silent.
 *
 * A detector fault must never break the page a person is trying to use — so the scan
 * is wrapped and every fault swallowed. That much was right. What it did with the
 * fault was a `console.warn`, which is a record for whoever has the devtools open at
 * that moment, and that is nobody.
 *
 * **The consequence was the product's worst possible answer.** A scan that never
 * produced a verdict — a restarting worker, a handler that threw, a version skew the
 * receiver answers `unsupported` to — looked exactly like a page with nothing hidden
 * on it. No banner, no line anywhere, and the person believing the page had been
 * checked. Three narrower give-ups here were made to speak (`report-frame.ts`, the
 * agent gate, the surface watch); the **main path** was not.
 *
 * Found by reading a CI trace rather than by guessing: `hostile-page.spec.ts` failed
 * on one attack out of nineteen, and the trace held eight console entries — all
 * extension-chunk preload warnings — and not one line from this product. Nothing had
 * thrown, and nothing had been found (B-74).
 *
 * Its own module for the reason the pacer and the report policy are: what happens when
 * something fails is a decision, and one nobody can call in a test is one nobody has
 * checked.
 */

export interface FailOpenDeps {
  /** For the developer with the console open — kept, and no longer the whole answer. */
  readonly warn: (cause: unknown) => void
  /** The record a person can find afterwards. */
  readonly note: (cause: unknown) => Promise<void>
}

/**
 * Runs `work`, and returns whether it finished.
 *
 * Never rejects: that is the "open" in fail open. The boolean is for a caller that
 * wants to know — nothing is obliged to look at it, and the record is written either
 * way.
 */
export async function failOpen(work: () => Promise<void>, deps: FailOpenDeps): Promise<boolean> {
  try {
    await work()
    return true
  } catch (cause) {
    deps.warn(cause)
    // The note is the least important thing happening at that moment and must not
    // turn a survivable fault into a thrown one — the same rule the frame report and
    // the surface watch follow.
    await deps.note(cause).catch(() => undefined)
    return false
  }
}
