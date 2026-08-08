/**
 * Asking the background what was blocked, without settling for its first shrug.
 *
 * The block screen used to ask once. If the background had not started — a cold
 * service worker under load is the ordinary case, not the rare one — the answer
 * was `null`, and the page said "the list that flagged it could not be
 * identified" and kept saying it. The statement is honest and the product's
 * voice requires it; what was wrong is that it was **premature**. The answer
 * existed two hundred milliseconds later and nothing ever asked again.
 *
 * Found by an end-to-end run: one failure in seventy-four, on the assertion
 * that the block names its source. In isolation it passed three times out of
 * three, which is what a one-shot read looks like from the outside.
 *
 * The policy below is deliberately small:
 *
 *   - **Never delay the first paint.** The blocked page is already prevented
 *     from rendering, so the interstitial is the only thing on screen; a
 *     spinner in its place would be a blank tab.
 *   - **Stop as soon as the answer is complete.** A named feed is the whole
 *     question.
 *   - **Stop when the user acts.** Repainting under someone's hand is worse
 *     than a vague source line.
 *   - **Give up after a bounded budget** and keep the honest statement. Trading
 *     a stated unknown for an endless wait would undo the rule this obeys.
 */

export interface BlockContext {
  readonly url?: string
  readonly feed?: string | null
  readonly entryDate?: string | null
  readonly feedAgeDays?: number | null
}

export interface SettleOptions {
  /** How many times to ask again after the first answer. */
  readonly attempts?: number
  /** Milliseconds between attempts. */
  readonly delayMs?: number
  /** Asked before each retry; `true` abandons the retries and keeps what we have. */
  readonly abandoned?: () => boolean
}

/** An answer worth stopping for: it names the list. */
export const isComplete = (context: BlockContext | null): boolean =>
  typeof context?.feed === 'string' && context.feed.length > 0

/**
 * Ask, hand each answer to `paint`, and keep asking while the answer is
 * incomplete.
 *
 * `paint` is called for the first answer always — that is the first paint — and
 * afterwards only when a retry produced a complete one. It is never called with
 * a worse answer than the screen already shows.
 */
export async function settleContext(
  ask: () => Promise<BlockContext | null>,
  paint: (context: BlockContext | null) => void,
  sleep: (ms: number) => Promise<void>,
  options: SettleOptions = {},
): Promise<BlockContext | null> {
  const attempts = options.attempts ?? 5
  const delayMs = options.delayMs ?? 200
  const abandoned = options.abandoned ?? ((): boolean => false)

  let context = await ask().catch(() => null)
  paint(context)

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (isComplete(context) || abandoned()) break
    await sleep(delayMs)
    if (abandoned()) break
    const next = await ask().catch(() => null)
    if (!isComplete(next)) continue
    context = next
    paint(context)
    break
  }

  return context
}
