import { describe, expect, it, vi } from 'vitest'

import {
  REPORT_ATTEMPTS,
  REPORT_GAP_MS,
  reportToEmbeddingPage,
  type FrameReport,
  type ReportDeps,
} from './report-frame.js'

/**
 * The retry that exists because the receiver is absent rather than broken.
 *
 * An embedded document can finish its whole scan before the embedding page's content
 * script has started, so a report sent once lands on a frame zero with no listener and
 * is dropped in silence — the end-to-end spec passed in isolation and failed in the
 * full suite on exactly that. These are the parts a browser run cannot pin down: how
 * many times, how far apart, and what is said when the budget is gone.
 */

const REPORT: FrameReport = { origin: 'https://ads.example.test', summary: 'hidden text', count: 2 }

function deps(overrides: Partial<ReportDeps> = {}): ReportDeps & { waited: number[] } {
  const waited: number[] = []
  return {
    waited,
    relay: vi.fn(async () => ({ delivered: true })),
    giveUp: vi.fn(async () => undefined),
    wait: async (ms: number) => {
      waited.push(ms)
    },
    ...overrides,
  }
}

describe('a frame reporting to the page that embeds it', () => {
  it('stops as soon as someone hears it', async () => {
    const d = deps()
    const outcome = await reportToEmbeddingPage(REPORT, d)

    expect(outcome).toEqual({ delivered: true, attempts: 1 })
    expect(d.relay).toHaveBeenCalledTimes(1)
    // The gap matters as much as the count: a report that lands first time must not
    // leave a timer behind in a frame that may live for the rest of the tab.
    expect(d.waited).toEqual([])
    expect(d.giveUp).not.toHaveBeenCalled()
  })

  it('keeps trying while nobody is listening yet, and stops on the first success', async () => {
    // Three refusals then a hearing: the case the whole module exists for, where the
    // embedding page's script had simply not started.
    let call = 0
    const d = deps({
      relay: vi.fn(async () => {
        call += 1
        return { delivered: call >= 4 }
      }),
    })

    const outcome = await reportToEmbeddingPage(REPORT, d)

    expect(outcome).toEqual({ delivered: true, attempts: 4 })
    expect(d.waited).toEqual([REPORT_GAP_MS, REPORT_GAP_MS, REPORT_GAP_MS])
    expect(d.giveUp).not.toHaveBeenCalled()
  })

  it('gives up after a bounded number of attempts rather than waiting forever', async () => {
    // "Until it works" is how a frame that will never be heard keeps a timer alive for
    // the life of the tab.
    const d = deps({ relay: vi.fn(async () => ({ delivered: false })) })

    const outcome = await reportToEmbeddingPage(REPORT, d)

    expect(outcome).toEqual({ delivered: false, attempts: REPORT_ATTEMPTS })
    expect(d.relay).toHaveBeenCalledTimes(REPORT_ATTEMPTS)
  })

  it('does not wait after the final attempt', async () => {
    // One gap fewer than attempts. Waiting once more changes nothing and only delays
    // the journal line that says this failed.
    const d = deps({ relay: vi.fn(async () => ({ delivered: false })) })
    await reportToEmbeddingPage(REPORT, d)
    expect(d.waited).toHaveLength(REPORT_ATTEMPTS - 1)
  })

  it('says so in the journal when it gives up, naming the count and the duration', async () => {
    /**
     * A silent give-up is the original defect arriving by another road: the product
     * found something and nobody was told. The numbers are in the sentence because
     * "could not report" leaves a reader unable to tell a slow page from a broken one.
     */
    const d = deps({ relay: vi.fn(async () => ({ delivered: false })) })
    await reportToEmbeddingPage(REPORT, d)

    expect(d.giveUp).toHaveBeenCalledTimes(1)
    const explain = vi.mocked(d.giveUp).mock.calls[0]?.[0] ?? ''
    expect(explain).toContain(String(REPORT_ATTEMPTS))
    expect(explain).toContain('9 seconds')
  })

  it('treats a thrown relay as "not delivered" and keeps its budget', async () => {
    // The background can be mid-restart, and a rejected message is the same fact as a
    // refused one: nobody heard it. Throwing out of here would abandon the report on
    // the first hiccup.
    let call = 0
    const d = deps({
      relay: vi.fn(async () => {
        call += 1
        if (call < 3) throw new Error('service worker starting')
        return { delivered: true }
      }),
    })

    await expect(reportToEmbeddingPage(REPORT, d)).resolves.toEqual({
      delivered: true,
      attempts: 3,
    })
  })

  it('treats an answer with no verdict as not delivered', async () => {
    // `undefined` is what the adapter returns when a message goes unanswered, and
    // `answer?.delivered === true` is what keeps that from reading as success.
    const d = deps({ relay: vi.fn(async () => undefined) })
    const outcome = await reportToEmbeddingPage(REPORT, d)
    expect(outcome.delivered).toBe(false)
  })

  it('does not let a failing journal write swallow the outcome', async () => {
    // The give-up note is the least important thing happening at that moment, and it
    // must not turn a known failure into a thrown one.
    const d = deps({
      relay: vi.fn(async () => ({ delivered: false })),
      giveUp: vi.fn(async () => {
        throw new Error('database gone')
      }),
    })
    await expect(reportToEmbeddingPage(REPORT, d)).resolves.toEqual({
      delivered: false,
      attempts: REPORT_ATTEMPTS,
    })
  })
})
