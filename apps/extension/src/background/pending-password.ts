import type { PasswordAnswer } from '@okolos/contracts'

/**
 * A leak verdict that has been reached but not yet shown to anybody.
 *
 * The check runs on `submit` and **after** the submission — deliberately, because
 * interrupting a login somebody was going to finish is worse than saying it afterwards.
 * But a form with an `action` navigates the document, and the navigation tears down the
 * content script while the check is still in flight: the verdict then arrives at nobody
 * and is lost, with nothing shown and nothing recorded (B-82). Measured, not reasoned —
 * `e2e/scn-035.spec.ts` failed inside the full suite on exactly this and passed alone.
 *
 * So the verdict is held until a surface confirms it drew it. The next document in the
 * same tab gets it pushed, which is the useful place anyway: after a successful login a
 * person is on the site's own page, and "the password you just sent to this site is in a
 * breach" is as true there as it was on the form.
 *
 * **Held, not queued.** One record per tab, replaced rather than accumulated: two
 * passwords submitted in one tab within a minute means the second is the one the person
 * is thinking about, and a queue of verdicts arriving one after another is noise nobody
 * reads.
 */

export interface PendingVerdict {
  /** The site the password was submitted to — the subject of the sentence. */
  readonly host: string
  /**
   * The answer as facts, not as words.
   *
   * The surface that draws it owns the wording, exactly as it does when it asked for the
   * check itself; holding a finished sentence here would freeze it in the language of the
   * write and put a second wording site in the background (B-75, B-77).
   */
  readonly verdict: PasswordAnswer
  /** When the check answered, ISO. Compared against the ceiling on every read. */
  readonly at: string
}

/**
 * One minute, and the ceiling matters more than its exact value.
 *
 * The gap this covers is a navigation — hundreds of milliseconds normally, seconds when
 * the worker is waking slowly (the spread B-78 measured). A minute is generous for that
 * and short enough that a verdict cannot surface on a page the person reached long after
 * the login it is about. Without a ceiling, `storage.local` survives a browser restart
 * and the record would wait for days.
 */
export const PENDING_TTL_MS = 60_000

/** Where one tab's held verdict lives. Keyed by tab so tabs cannot overwrite each other. */
export function pendingKey(tabId: number): string {
  return `pending:password:${tabId}`
}

export interface PendingStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

/** Holds a verdict for one tab, replacing whatever that tab was holding. */
export async function holdVerdict(
  store: PendingStore,
  tabId: number,
  verdict: PendingVerdict,
): Promise<void> {
  await store.set(pendingKey(tabId), verdict)
}

/**
 * The verdict this tab is holding, or null — and a record past the ceiling is **removed**
 * rather than returned.
 *
 * Removed rather than left in place, because a record that is read and rejected on every
 * page load of every tab is a record that never goes away. Expiry is the answer to
 * "should this be shown", and deletion is the answer to "should this still exist"; doing
 * only the first is how a store grows a tail of things nobody will ever use.
 */
export async function takeVerdict(
  store: PendingStore,
  tabId: number,
  now: number,
): Promise<PendingVerdict | null> {
  const held = await store.get<PendingVerdict>(pendingKey(tabId))
  if (held === undefined) return null

  const at = Date.parse(held.at)
  // An unparseable timestamp is treated as expired: a record whose age cannot be
  // established must not be shown, and must not be kept either.
  if (!Number.isFinite(at) || now - at > PENDING_TTL_MS) {
    await store.remove(pendingKey(tabId))
    return null
  }
  return held
}

/** Forgets this tab's held verdict — called when a surface confirms it drew it. */
export async function releaseVerdict(store: PendingStore, tabId: number): Promise<void> {
  await store.remove(pendingKey(tabId))
}
