/**
 * How often the page may be scanned, and what happens to a scan that does not
 * fit.
 *
 * Two rules, and the second is the one that was missing. **Coalesce:** a burst
 * of mutations is one scan, not one per mutation. **Defer, never drop:** the
 * budget is a pace, not a quota — work that cannot run this second runs in the
 * next one.
 *
 * The version this replaces dropped an over-budget scan and left nothing to
 * re-arm it. A page that mutated hard enough to exhaust the budget and then
 * went quiet was never examined in its final state, which is precisely where
 * an injection would be placed by anyone who read this file. Nothing tested
 * it, because the policy lived in three module variables and a `setTimeout`
 * rather than in something that could be asked a question.
 */

export const RESCAN_DEBOUNCE_MS = 250
export const MAX_RESCANS_PER_SECOND = 2
const WINDOW_MS = 1000

export interface PacerDeps {
  readonly now: () => number
  readonly setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  readonly clearTimer: (handle: ReturnType<typeof setTimeout>) => void
  /** The work itself. Errors are the caller's to handle; the pacer only times. */
  readonly run: () => void
}

export interface Pacer {
  /** Ask for a scan. Cheap, idempotent within a debounce window. */
  request(): void
  /** Forget any scan that is owed. For teardown, so a timer cannot outlive its page. */
  cancel(): void
}

export function createPacer(deps: PacerDeps): Pacer {
  /** When each scan of the current window ran, oldest first. */
  let recent: number[] = []
  let pending: ReturnType<typeof setTimeout> | null = null

  const arm = (delay: number): void => {
    // One timer at a time is what makes a burst one scan. A second request
    // while one is armed is already accounted for.
    if (pending !== null) return
    pending = deps.setTimer(fire, delay)
  }

  function fire(): void {
    pending = null
    const now = deps.now()
    recent = recent.filter((at) => now - at < WINDOW_MS)

    if (recent.length >= MAX_RESCANS_PER_SECOND) {
      // Over budget. The oldest run leaves the window at `+ WINDOW_MS`, and
      // that is when this scan becomes affordable — so it is re-armed for
      // exactly then rather than discarded.
      const oldest = recent[0] ?? now
      arm(Math.max(0, oldest + WINDOW_MS - now))
      return
    }

    recent.push(now)
    deps.run()
  }

  return {
    request(): void {
      arm(RESCAN_DEBOUNCE_MS)
    },
    cancel(): void {
      if (pending !== null) {
        deps.clearTimer(pending)
        pending = null
      }
    },
  }
}
