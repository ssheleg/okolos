/**
 * The same fact, written once — and written again only if the first write failed.
 *
 * **Why this exists.** The journal is a store with a retention period, so ten
 * identical lines evict the thing that happened once. Restore made that concrete: with
 * B-36 the refusal became a *standing* fact — while the page's own content sits in a
 * node we emptied, every press of "Restore" honestly repeats the same sentence — and a
 * `page/note` went out on every press. Ten presses on one node, ten identical records
 * (B-64).
 *
 * **It is a class, not a case, and two more instances were written the same morning.**
 * The surface slot notes every refused claim, and a page with several findings of one
 * kind asks more than once; the scan's give-up notes every failed scan, and a page that
 * mutates while the worker is unavailable fails repeatedly. Both flood the same store
 * by the same means. So the rule lives here and all three pass through it.
 *
 * **Remembered on success only.** Marking the key before the write would turn a failed
 * write into a fact nobody ever records — absence reading as a pass, on the record that
 * exists to prove something happened. Since B-74 the adapter rejects an error answer,
 * so "the write succeeded" is finally an observable thing rather than an assumption.
 *
 * **What it deliberately does not change: the screen.** The sentence still appears on
 * every press. A person pressing a button is owed an answer every time; the journal is
 * owed the fact once.
 */

export interface JournalOnce {
  /**
   * Writes `fact` unless this exact key has already been written successfully.
   *
   * Returns what happened, for a caller that wants to know and for a test that has to.
   */
  record(key: string, write: () => Promise<void>): Promise<'written' | 'already' | 'failed'>
  /** How many distinct facts this frame has recorded — read by tests, not by callers. */
  size(): number
}

export function createJournalOnce(): JournalOnce {
  const written = new Set<string>()

  return {
    async record(key, write) {
      if (written.has(key)) return 'already'
      try {
        await write()
      } catch {
        // Not remembered: the next press should try again, because nothing was
        // recorded and the fact is still true.
        return 'failed'
      }
      written.add(key)
      return 'written'
    },
    size: () => written.size,
  }
}
