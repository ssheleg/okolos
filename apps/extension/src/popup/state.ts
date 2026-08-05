import { buildQueue, diffSince, QUEUE_LIMIT, type JournalEntry, type QueueItem } from '@okolos/core-queue'
import type { FindingRecord, JournalRecord } from '@okolos/storage'
import type { PopupState } from '@okolos/ui'

/** The popup's ready state — the only one this module can produce. */
type ReadyState = Extract<PopupState, { kind: 'ready' }>

/**
 * Turning what is in storage into the popup's three-second answer.
 *
 * Kept apart from the page wiring so the rules can be tested without a browser:
 * which findings count as outstanding, when a page may be called clean, and how
 * a stored record becomes a sentence.
 */

/** A journal record whose shape we do not recognise is counted, not guessed at. */
export interface MappedJournal {
  readonly entries: readonly JournalEntry[]
  readonly unreadable: number
}

export function toQueueItems(
  findings: readonly FindingRecord[],
  /** `defer:<id>` settings, so "not now" survives the popup closing. */
  deferrals: ReadonlyMap<string, string> = new Map(),
): QueueItem[] {
  return findings
    .filter((finding) => finding.resolvedAt === null)
    .map((finding) => {
      const verdict = finding.verdict
      const snippet = verdict?.evidence.find((item) => item.snippet)?.snippet
      const item: QueueItem = {
        id: finding.id,
        severity: verdict?.severity ?? 'minor',
        createdAt: finding.createdAt,
        summary: snippet
          ? `Hidden text on ${hostOf(finding.subject)}: "${snippet.slice(0, 80)}"`
          : `Something was found on ${hostOf(finding.subject)}`,
        actionLabel: 'Open the page',
        // Absent on purpose when there is no verdict to read it from: the queue
        // then says it is ranking by severity alone rather than implying more.
        ...(verdict ? { fixability: 'one-click' as const } : {}),
        ...(deferrals.has(finding.id) ? { deferredUntil: deferrals.get(finding.id) as string } : {}),
      }
      return item
    })
}

export function mapJournal(records: readonly JournalRecord[]): MappedJournal {
  const entries: JournalEntry[] = []
  let unreadable = 0

  for (const record of records) {
    if (typeof record.createdAt !== 'string' || typeof record.kind !== 'string') {
      unreadable += 1
      continue
    }
    const detail = record.detail ?? {}
    const explain = typeof detail.explain === 'string' ? detail.explain : null
    entries.push({
      id: record.id,
      createdAt: record.createdAt,
      kind: record.kind,
      summary: explain ?? DEFAULT_SUMMARY[record.kind],
      // A decision the user made is not the same event as one the product made,
      // and the journal is the place where that difference is legible.
      automatic: detail.reason !== 'user-blocked' && detail.reason !== 'user-allowed',
    })
  }

  return { entries, unreadable }
}

const DEFAULT_SUMMARY: Record<JournalEntry['kind'], string> = {
  verdict: 'A finding was recorded',
  action: 'An action was decided',
  error: 'Something went wrong',
  'detector-disabled': 'A detector was turned off',
}

export interface PopupInputs {
  readonly findings: readonly FindingRecord[]
  readonly journal: readonly JournalRecord[]
  readonly activeUrl: string | null
  readonly lastCheck: string | null
  readonly expanded: boolean
  readonly deferrals?: ReadonlyMap<string, string>
  /** ISO now. Without it the ranker cannot tell a live deferral from a stale one. */
  readonly now?: string
}

export function buildPopupState(inputs: PopupInputs): ReadyState {
  const items = toQueueItems(inputs.findings, inputs.deferrals)
  const queue = buildQueue(
    items,
    inputs.expanded ? Math.max(items.length, QUEUE_LIMIT) : QUEUE_LIMIT,
    inputs.now ?? '',
  )
  const { entries, unreadable } = mapJournal(inputs.journal)

  return {
    kind: 'ready',
    page: pageVerdict(inputs.activeUrl, inputs.findings),
    queue,
    changed: diffSince(entries, inputs.lastCheck, { unreadable }).total,
    lastCheck: inputs.lastCheck,
  }
}

function pageVerdict(
  activeUrl: string | null,
  findings: readonly FindingRecord[],
): { verdict: 'clean' | 'finding' | 'unknown'; reason: string } {
  if (activeUrl === null) {
    // Not knowing which page this is means not being able to say it is clean.
    return { verdict: 'unknown', reason: 'This page could not be identified, so it was not checked.' }
  }

  const subject = subjectOf(activeUrl)
  if (subject === null) {
    return { verdict: 'unknown', reason: 'This page could not be identified, so it was not checked.' }
  }

  const open = findings.filter(
    (finding) => finding.resolvedAt === null && finding.subject === subject,
  )
  return open.length === 0
    ? { verdict: 'clean', reason: 'No hidden instructions were found on this page.' }
    : {
        verdict: 'finding',
        reason: `Hidden text on this page addresses an assistant rather than you (${open.length} finding${
          open.length === 1 ? '' : 's'
        }).`,
      }
}

/** The same key the background writes: `page:<origin><path>`. */
export function subjectOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return `page:${parsed.origin}${parsed.pathname}`
  } catch {
    return null
  }
}

function hostOf(subject: string): string {
  try {
    return new URL(subject.replace(/^page:/, '')).host
  } catch {
    return 'this page'
  }
}
