/**
 * Writing the audit entry when the device has run out of room.
 *
 * Everything that may leave this device is logged first, and a failed log
 * cancels the send — that is the whole privacy guarantee. It also means a full
 * database stops the extension protecting anyone: no feed updates, so the
 * block list goes stale; no password checks; no leak lookups. All of it
 * reported per-feature as "that source was unavailable", which is true and
 * useless, because the cause is the same for every one of them and none of
 * them names it.
 *
 * The extension already knows how to free space — the retention sweep exists
 * and runs on a schedule. What was missing is the connection: the audit write
 * is exactly where "out of room" is discovered, and discovering it is the
 * moment to sweep.
 */

/** A quota failure, under whichever name the engine gives it. */
export function isOutOfSpace(cause: unknown): boolean {
  if (typeof DOMException !== 'undefined' && cause instanceof DOMException) {
    // Chromium and Firefox both use this name; the numeric code is legacy and
    // not always set.
    if (cause.name === 'QuotaExceededError') return true
  }
  const name = (cause as { name?: unknown } | null)?.name
  const message = (cause as { message?: unknown } | null)?.message
  return (
    name === 'QuotaExceededError' ||
    (typeof message === 'string' && /quota|storage is full|out of (disk )?space/i.test(message))
  )
}

export interface SpaceAwareDeps {
  /** Writes the entry, or throws. */
  readonly write: (entry: unknown) => Promise<void>
  /** Frees what retention allows. Returns without throwing on its own failures. */
  readonly freeSpace: () => Promise<void>
  /** Told once per recovery, so the user can see it happened. */
  readonly report: (what: 'swept-to-make-room' | 'still-full') => void
}

/**
 * Writes an audit entry, and on a full database sweeps once and tries again.
 *
 * One retry, not a loop: if a sweep did not make room, the next attempt will
 * not either, and a loop here would sit between the user and every request the
 * extension makes.
 */
export function spaceAwareWrite(deps: SpaceAwareDeps): (entry: unknown) => Promise<void> {
  return async (entry) => {
    try {
      await deps.write(entry)
      return
    } catch (cause) {
      if (!isOutOfSpace(cause)) throw cause
    }

    await deps.freeSpace()

    try {
      await deps.write(entry)
      deps.report('swept-to-make-room')
    } catch (cause) {
      // Still no room. The caller turns this into a refusal to send, which is
      // the correct outcome — but it is now reported as what it is.
      deps.report('still-full')
      throw cause
    }
  }
}
