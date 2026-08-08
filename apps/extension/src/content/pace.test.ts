import { describe, expect, it } from 'vitest'

import { createPacer } from './pace.js'

/**
 * The scan pacer, extracted from the content script so its policy can be
 * stated rather than inferred from three variables and a timeout.
 *
 * The rule it exists to enforce: **a budget is a pace, not a quota.** Work that
 * does not fit in this second is taken in the next one. Dropping it means the
 * page's final state is never examined — and the last mutation of a burst is
 * exactly where an injection would be placed by anyone who noticed.
 */

/** A clock and timer under the test's control, so nothing here waits. */
function harness() {
  let now = 0
  const timers: { at: number; fn: () => void }[] = []
  const runs: number[] = []

  const pacer = createPacer({
    now: () => now,
    setTimer: (fn, ms) => {
      const timer = { at: now + ms, fn }
      timers.push(timer)
      return timer as unknown as ReturnType<typeof setTimeout>
    },
    clearTimer: (handle) => {
      const index = timers.indexOf(handle as unknown as { at: number; fn: () => void })
      if (index >= 0) timers.splice(index, 1)
    },
    run: () => {
      runs.push(now)
    },
  })

  return {
    pacer,
    runs,
    /** Advances the clock, firing every timer whose moment has come. */
    tick(ms: number) {
      const target = now + ms
      for (;;) {
        const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0]
        if (!due) break
        timers.splice(timers.indexOf(due), 1)
        now = due.at
        due.fn()
      }
      now = target
    },
  }
}

describe('the scan pacer', () => {
  it('coalesces a burst into one scan', () => {
    const h = harness()
    for (let i = 0; i < 20; i += 1) h.pacer.request()
    h.tick(300)
    expect(h.runs).toHaveLength(1)
  })

  it('holds to its budget across a busy second', () => {
    const h = harness()
    for (let second = 0; second < 1; second += 1) {
      for (let i = 0; i < 10; i += 1) {
        h.pacer.request()
        h.tick(100)
      }
    }
    expect(h.runs.length).toBeLessThanOrEqual(2)
  })

  it('defers the scan it cannot afford instead of dropping it', () => {
    // The defect this test was written for. A page that mutates hard enough to
    // exhaust the budget and then stops leaves its final state unexamined: the
    // scan that would have read it is discarded, and nothing re-arms.
    const h = harness()

    h.pacer.request()
    h.tick(300)
    h.pacer.request()
    h.tick(300)
    expect(h.runs, 'the budget should allow two').toHaveLength(2)

    // A third request inside the same second cannot run now — but it must run.
    h.pacer.request()
    h.tick(300)
    expect(h.runs, 'the third was over budget, so not yet').toHaveLength(2)

    h.tick(2000)
    expect(h.runs, 'and nothing ever came back for it').toHaveLength(3)
  })

  it('does not stack deferrals into a backlog', () => {
    // Ten requests that arrive over budget are still one scan owed, not ten.
    const h = harness()
    h.pacer.request()
    h.tick(300)
    h.pacer.request()
    h.tick(300)
    for (let i = 0; i < 10; i += 1) h.pacer.request()
    h.tick(5000)
    expect(h.runs).toHaveLength(3)
  })
})
