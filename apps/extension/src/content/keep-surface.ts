/**
 * Putting the warning back when the page takes it out of the document.
 *
 * **The last way a page could silence us, and it is not CSS.** ADR-0001 promised
 * three things: the page cannot read the warning, cannot change it, cannot hide it.
 * The first two hold by the closed shadow root, the third by `OVERLAY_ARMOUR`, and
 * the name cannot be stolen because `createOverlayHost` falls back to one the page
 * could not have predicted. What remained, measured in Chromium on 2026-08-20, was
 * a script:
 *
 *     setInterval(() => document.querySelectorAll('okolos-banner')
 *       .forEach((n) => n.remove()), 50)
 *
 * No host, no panel, no warning, and nothing said so.
 *
 * **Why re-mounting for ever is the wrong answer.** The page removes, we add, the
 * page removes: a loop whose loser is the battery, not the page. So this is a
 * *policy* — how many times, how far apart, and what happens when the budget runs
 * out — in its own module for the reason `report-frame.ts` is: a policy nobody can
 * call in a test is a policy nobody has checked.
 *
 * **The budget ends in an escalation, not in silence.** A silent give-up is the
 * original defect arriving by another road: the product found something and nobody
 * was told. So the last act is a channel the page does not own — the badge on the
 * extension's own icon, which needs no permission the manifest does not already
 * have, and a journal line naming the page and the count.
 *
 * **A dismissal is not a removal.** The user closing the banner also takes the host
 * out of the document, and fighting that would be the same defect pointed at the
 * person instead of the page. The caller stops the watch before it destroys, so
 * "gone" here always means "gone without us doing it".
 */

/**
 * Three re-mounts, a quarter-second apart.
 *
 * Small on purpose. A page that removes on a 50 ms interval exhausts this in under a
 * second, which is the right outcome: the reader sees the warning flash, the icon
 * then carries it, and no timer is left running for the life of the tab. Larger
 * numbers buy nothing — a page that removes once will not remove four times — and
 * cost exactly the battery war this avoids.
 */
export const REMOUNT_ATTEMPTS = 3
export const REMOUNT_GAP_MS = 250

export interface SurfaceWatch {
  /** Is the surface still in the document? */
  readonly present: () => boolean
  /** Draw it again. Returns false when it could not be drawn at all. */
  readonly remount: () => boolean
  /**
   * Calls back on every DOM change that could have removed it; returns a stop.
   *
   * A subscription rather than a poll: a page that removes the node once should cost
   * one callback, not a timer for the life of the tab.
   */
  readonly onChange: (react: () => void) => () => void
  readonly wait: (ms: number) => Promise<void>
  /** The escalation. Called once, with how many times the page took it away. */
  readonly escalate: (removals: number) => Promise<void>
}

export interface WatchHandle {
  /** Called by the caller before its own destroy, so a dismissal is not a removal. */
  readonly stop: () => void
  /** Settles when the budget is spent or the watch is stopped. */
  readonly done: Promise<{ removals: number; escalated: boolean }>
}

export function keepSurfaceMounted(watch: SurfaceWatch): WatchHandle {
  let removals = 0
  let stopped = false
  let unsubscribe = (): void => {}
  let settle: (outcome: { removals: number; escalated: boolean }) => void = () => {}

  const done = new Promise<{ removals: number; escalated: boolean }>((resolve) => {
    settle = resolve
  })

  /** Guards against a second entry while a gap is being waited out. */
  let busy = false

  async function react(): Promise<void> {
    if (stopped || busy || watch.present()) return
    busy = true
    try {
      removals += 1

      if (removals > REMOUNT_ATTEMPTS) {
        unsubscribe()
        stopped = true
        await watch.escalate(removals).catch(() => undefined)
        settle({ removals, escalated: true })
        return
      }

      // The gap is before the re-mount, not after: a page that removes in a tight
      // loop would otherwise get a re-mount per mutation with no pause at all.
      await watch.wait(REMOUNT_GAP_MS)
      if (stopped) return
      if (!watch.remount()) {
        // No surface could be drawn — the page owns the name and something else is
        // wrong. Escalating is the only remaining way to say anything at all.
        unsubscribe()
        stopped = true
        await watch.escalate(removals).catch(() => undefined)
        settle({ removals, escalated: true })
      }
    } finally {
      busy = false
    }
  }

  unsubscribe = watch.onChange(() => {
    void react()
  })

  return {
    stop() {
      if (stopped) return
      stopped = true
      unsubscribe()
      settle({ removals, escalated: false })
    },
    done,
  }
}
