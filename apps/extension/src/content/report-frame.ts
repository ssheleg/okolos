/**
 * A frame telling the page that embeds it, until someone is there to hear.
 *
 * Its own module rather than a closure in the entry point, for the reason the pacer
 * and the pending-marker are: it is a policy — how many times, how far apart, and
 * what happens when the budget runs out — and a policy nobody can call in a test is
 * a policy nobody has checked.
 *
 * **Why it repeats at all, since a retry is usually a way of hiding something.** The
 * receiver is not failing; it does not exist yet. An embedded document can reach
 * `document_idle` and finish its entire scan before the embedding page's content
 * script has started, and a report sent once then arrives at a frame zero with no
 * listener and is dropped in silence. Measured: 135 ms end to end when the parent
 * happens to be ready first, and never when it is not — the end-to-end spec passed in
 * isolation and failed in the full suite on exactly that, one run out of one. Setting
 * the budget back to a single attempt reproduces it.
 *
 * **Why it goes through the background rather than to `window.top` directly.** That
 * hop travels through the page's own window, where the page can forge it — and the
 * top frame would have no way to tell an extension's report from a claim made by the
 * thing being reported. The background sits outside the page.
 */

export interface FrameReport {
  readonly origin: string
  readonly summary: string
  readonly count: number
}

export interface ReportDeps {
  /** Asks the background to relay, and says whether anyone was there. */
  readonly relay: (report: FrameReport) => Promise<{ delivered: boolean } | undefined>
  /**
   * Journalled when the budget runs out — a silent give-up is the defect returning.
   *
   * Facts, not a sentence. The note lands in the journal, and the journal is
   * dumped verbatim into the file the user downloads, so a sentence composed here
   * would be English copy on a surface a person reads — in a product whose
   * audience reads Russian. The wording belongs to the caller, which can reach the
   * catalogue; the numbers belong here, which is where the budget is decided.
   */
  readonly giveUp: (facts: { attempts: number; seconds: number }) => Promise<void>
  readonly wait: (ms: number) => Promise<void>
}

/**
 * Twelve attempts, three quarters of a second apart: nine seconds.
 *
 * Long because a page that has not started its content script within nine seconds is
 * having a worse problem than this one, and bounded because "until it works" is how a
 * frame that will never be heard keeps a timer alive for the life of the tab.
 */
export const REPORT_ATTEMPTS = 12
export const REPORT_GAP_MS = 750

export async function reportToEmbeddingPage(
  report: FrameReport,
  deps: ReportDeps,
): Promise<{ delivered: boolean; attempts: number }> {
  for (let attempt = 1; attempt <= REPORT_ATTEMPTS; attempt += 1) {
    const answer = await deps.relay(report).catch(() => undefined)
    if (answer?.delivered === true) return { delivered: true, attempts: attempt }
    // Not after the last attempt: waiting once more changes nothing and delays the
    // journal line that says this failed.
    if (attempt < REPORT_ATTEMPTS) await deps.wait(REPORT_GAP_MS)
  }

  const seconds = Math.round((REPORT_ATTEMPTS * REPORT_GAP_MS) / 1000)
  await deps.giveUp({ attempts: REPORT_ATTEMPTS, seconds }).catch(() => undefined)
  return { delivered: false, attempts: REPORT_ATTEMPTS }
}
