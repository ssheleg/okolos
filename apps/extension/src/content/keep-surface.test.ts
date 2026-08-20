import { describe, expect, it, vi } from 'vitest'

import {
  REMOUNT_ATTEMPTS,
  REMOUNT_GAP_MS,
  keepSurfaceMounted,
  type SurfaceWatch,
} from './keep-surface.js'

/**
 * The last way a page could silence the warning, and the policy that answers it.
 *
 * These are the parts a browser run cannot pin down: how many times, how far apart,
 * what is said when the budget is gone, and — the one that matters most — that the
 * user closing the banner is not treated as an attack on it.
 */

function watch(overrides: Partial<SurfaceWatch> = {}): SurfaceWatch & {
  fire: () => void
  waited: number[]
  mounts: number
} {
  const waited: number[] = []
  let react = (): void => {}
  const state = {
    present: true,
    mounts: 0,
  }
  const base: SurfaceWatch & { fire: () => void; waited: number[]; mounts: number } = {
    waited,
    get mounts() {
      return state.mounts
    },
    fire: () => {
      react()
    },
    present: () => state.present,
    remount: () => {
      state.mounts += 1
      state.present = true
      return true
    },
    onChange: (callback) => {
      react = callback
      return () => {
        react = () => {}
      }
    },
    wait: async (ms: number) => {
      waited.push(ms)
    },
    escalate: vi.fn(async () => undefined),
    ...overrides,
  }
  return base
}

/** Removes the surface, then tells the watch a mutation happened. */
async function pageRemoves(w: SurfaceWatch & { fire: () => void }, present: { value: boolean }) {
  present.value = false
  w.fire()
  // The reaction is async; one microtask turn is all the fake needs.
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('keeping the warning on a page that removes it', () => {
  it('does nothing at all while the surface is there', async () => {
    const w = watch()
    const handle = keepSurfaceMounted(w)
    w.fire()
    await Promise.resolve()

    expect(w.mounts).toBe(0)
    expect(w.waited).toEqual([])
    expect(w.escalate).not.toHaveBeenCalled()
    handle.stop()
    await expect(handle.done).resolves.toEqual({ removals: 0, escalated: false })
  })

  it('puts it back, with a gap before the re-mount rather than after', async () => {
    // Before: a page removing in a tight loop would otherwise get a re-mount per
    // mutation with no pause at all, which is the battery war this exists to avoid.
    const present = { value: true }
    let mounts = 0
    const w = watch({
      present: () => present.value,
      remount: () => {
        mounts += 1
        present.value = true
        return true
      },
    })
    const handle = keepSurfaceMounted(w)

    await pageRemoves(w, present)

    expect(mounts).toBe(1)
    expect(w.waited).toEqual([REMOUNT_GAP_MS])
    handle.stop()
  })

  it('escalates once the budget is spent, and stops watching', async () => {
    const present = { value: true }
    const w = watch({
      present: () => present.value,
      remount: () => {
        present.value = true
        return true
      },
    })
    const handle = keepSurfaceMounted(w)

    for (let round = 0; round <= REMOUNT_ATTEMPTS; round += 1) await pageRemoves(w, present)

    expect(w.escalate).toHaveBeenCalledTimes(1)
    expect(vi.mocked(w.escalate).mock.calls[0]?.[0]).toBe(REMOUNT_ATTEMPTS + 1)
    await expect(handle.done).resolves.toEqual({
      removals: REMOUNT_ATTEMPTS + 1,
      escalated: true,
    })

    // And nothing more happens: a stopped watch on a page still removing must not
    // keep counting, or the journal fills with one line per mutation.
    const before = w.waited.length
    await pageRemoves(w, present)
    expect(w.waited.length).toBe(before)
    expect(w.escalate).toHaveBeenCalledTimes(1)
  })

  it('treats a dismissal as a dismissal, not as an attack', async () => {
    /**
     * The user closing the banner also takes the host out of the document. Fighting
     * that would be this defect pointed at the person instead of the page — the
     * banner they just closed reappearing three times, then an icon badge about it.
     * The caller stops the watch before destroying, so "gone" always means "gone
     * without us doing it".
     */
    const present = { value: true }
    const w = watch({ present: () => present.value })
    const handle = keepSurfaceMounted(w)

    handle.stop()
    await pageRemoves(w, present)

    expect(w.mounts).toBe(0)
    expect(w.escalate).not.toHaveBeenCalled()
    await expect(handle.done).resolves.toEqual({ removals: 0, escalated: false })
  })

  it('abandons a reaction already in flight when the user dismisses mid-gap', async () => {
    /**
     * The case that makes the `stopped` check inside the reaction load-bearing, and it
     * took a plant that failed to land to find it: unsubscribing protects every
     * *future* callback, and this is about the one already running. The page removes
     * the surface, the reaction starts waiting out its gap, and the user closes the
     * banner during that quarter-second. Without the check the watch re-mounts a
     * banner the user has just dismissed — the same defect pointed at the person.
     */
    const present = { value: true }
    let release = (): void => {}
    let mounts = 0
    const w = watch({
      present: () => present.value,
      remount: () => {
        mounts += 1
        return true
      },
      wait: async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
      },
    })
    const handle = keepSurfaceMounted(w)

    present.value = false
    w.fire()
    await Promise.resolve()

    handle.stop()
    release()
    await Promise.resolve()
    await Promise.resolve()

    expect(mounts, 'a dismissed banner was put back').toBe(0)
    expect(w.escalate).not.toHaveBeenCalled()
  })

  it('escalates immediately when the surface cannot be drawn at all', async () => {
    // `createOverlayHost` throws when the page owns every name it tries. Retrying
    // that is pointless; saying nothing about it is worse.
    const present = { value: true }
    const w = watch({
      present: () => present.value,
      remount: () => false,
    })
    const handle = keepSurfaceMounted(w)

    await pageRemoves(w, present)

    expect(w.escalate).toHaveBeenCalledTimes(1)
    await expect(handle.done).resolves.toMatchObject({ escalated: true })
  })

  it('does not let a failing escalation leave the promise unsettled', async () => {
    // The badge and the journal are the least important things happening at that
    // moment, and a caller awaiting `done` must not wait for ever because one failed.
    const present = { value: true }
    const w = watch({
      present: () => present.value,
      remount: () => {
        present.value = true
        return true
      },
      escalate: vi.fn(async () => {
        throw new Error('the background is restarting')
      }),
    })
    const handle = keepSurfaceMounted(w)

    for (let round = 0; round <= REMOUNT_ATTEMPTS; round += 1) await pageRemoves(w, present)

    await expect(handle.done).resolves.toMatchObject({ escalated: true })
  })

  it('counts one removal per removal, not one per mutation', async () => {
    /**
     * A page's own script fires many mutations while it rebuilds; only the ones that
     * left the surface absent are attacks on it. Without the presence check every
     * unrelated DOM change would spend a third of the budget.
     */
    const present = { value: true }
    const w = watch({
      present: () => present.value,
      remount: () => {
        present.value = true
        return true
      },
    })
    const handle = keepSurfaceMounted(w)

    for (let noise = 0; noise < 20; noise += 1) {
      w.fire()
      await Promise.resolve()
    }
    expect(w.escalate).not.toHaveBeenCalled()
    expect(w.waited).toEqual([])
    handle.stop()
  })
})
