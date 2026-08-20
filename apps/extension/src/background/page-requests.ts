import type { OkolosDatabase } from '@okolos/storage'

/**
 * Whether a state-changing request the page made is worth recording.
 *
 * Its own module because it is the decision the page must not own. It used to be
 * a boolean inside the MAIN-world watcher, flipped by `window.postMessage` — and
 * `event.source === win` is true of the page's own post, so one line of page
 * script bought silence for the rest of the page's life. ADR-0009 says the cost
 * of a forged line is noise rather than silence; the code sold silence.
 *
 * The question is now answered from the extension's own database, against the
 * origin the **sender** reports rather than the host in the payload: a page can
 * put any host in a message it forges, and cannot forge where the message came
 * from.
 */

export interface PageRequest {
  readonly method: string
  /** Host only. A query string carries the very thing this product protects. */
  readonly host: string
}

/**
 * Whether this origin still has a finding nobody has dealt with.
 *
 * Subjects are stored as `page:<origin><path>`, so the match is a prefix on the
 * origin: a finding on `/a` is a finding on that site, and the watcher reports
 * per page rather than per path.
 *
 * An absent origin answers `false`. A report whose sender cannot be placed is a
 * report about nothing, and treating it as "probably worth keeping" would hand
 * the decision back to whoever sent it — which is the defect, restated.
 */
export async function hasUnresolvedFinding(
  db: OkolosDatabase,
  origin: string | undefined,
): Promise<boolean> {
  if (!origin) return false
  const rows = await db.getAll('findings')
  return rows.some((row) => row.resolvedAt === null && row.subject.startsWith(`page:${origin}`))
}

export interface JournalDeps {
  readonly db: OkolosDatabase
  now(): string
}

/**
 * Writes the record, or writes nothing and says so by returning `false`.
 *
 * The return value is the fact the caller may need — an RPC handler answers
 * `{ ok: true }` either way, because "your report was dropped" is not something
 * a page is owed and telling it would be one more thing for a page to measure.
 */
export async function recordPageRequest(
  deps: JournalDeps,
  request: PageRequest,
  origin: string | undefined,
): Promise<boolean> {
  if (!(await hasUnresolvedFinding(deps.db, origin))) return false

  const now = deps.now()
  await deps.db.put('journal', {
    id: `page-request:${request.host}:${now}`,
    createdAt: now,
    kind: 'verdict',
    detail: {
      explainKey: 'logPageRequest',
      explainArgs: [request.method, request.host],
      reason: 'page-request',
    },
  })
  return true
}
