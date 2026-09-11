import { CHECKS } from './verdict.js'
import type { MailMessage } from './types.js'
import type { CheckId, MailVerdict, Severity } from './verdict.js'

/**
 * SCR-21, as data rather than as text.
 *
 * Not one sentence lives in this file, and that is a rule rather than a style.
 * A reason written as a sentence freezes in the language of the day it was
 * written (B-115), and this package is bound by REQ-01 to stay free of the
 * host anyway. So a line is a catalogue key plus the arguments that key needs,
 * and the surface turns it into words.
 *
 * The order is the screen's contract: what this message is, the verdict, the
 * signals, **then** the checks that could not be made — never interleaved, so a
 * reader who stops halfway has read the findings, and a reader who goes on
 * learns what the findings are worth.
 */

export type ReportKind =
  | 'header'
  | 'verdict'
  | 'signal'
  | 'fact'
  | 'checked'
  | 'not-run'
  | 'truncated'
  | 'review'

export interface ReportLine {
  readonly kind: ReportKind
  readonly key: string
  readonly args: readonly string[]
}

const VERDICT_KEY: Readonly<Record<Severity, string>> = {
  critical: 'mailVerdictCritical',
  major: 'mailVerdictMajor',
  minor: 'mailVerdictMinor',
  none: 'mailVerdictNone',
}

/**
 * "Nothing found" and "nothing was looked at" are different answers.
 *
 * Found by running the command rather than by reading the diff: the walking
 * skeleton printed `Ничего не найдено` above four lines saying no check had
 * been built, which is exactly the bare clean SCR-21's empty state refuses. The
 * severity is genuinely `none` in both cases — the distinction is not a
 * severity, so it cannot live in `VERDICT_KEY`.
 */
const NOTHING_KEY: Readonly<Record<'unchecked', string>> = {
  unchecked: 'mailVerdictUnchecked',
}

const REVIEW_KEY: Readonly<Record<'local' | 'cloud' | 'none', string>> = {
  local: 'mailReviewLocal',
  cloud: 'mailReviewCloud',
  none: 'mailReviewNone',
}

/**
 * The name of each check, as a map rather than as a template.
 *
 * `mailCheck_${check}` would read identically and would be invisible to
 * `tools/locales.test.ts`, which finds keys as quoted literals and in
 * `const NAME_KEY: Record<...>` maps. A key the gate cannot see is a key that
 * gets reported dead and then deleted — which is how a live message disappears
 * from a catalogue while its caller keeps asking for it.
 */
const LINE_KEY: Readonly<Record<'header' | 'notRun' | 'truncated', string>> = {
  header: 'mailHeader',
  notRun: 'mailNotRun',
  truncated: 'mailTruncated',
}

const CHECK_KEY: Readonly<Record<CheckId, string>> = {
  sender: 'mailCheckSender',
  links: 'mailCheckLinks',
  hidden: 'mailCheckHidden',
  attachments: 'mailCheckAttachments',
}

export function buildReport(message: MailMessage, verdict: MailVerdict): readonly ReportLine[] {
  const lines: ReportLine[] = []

  const sender = message.from[0]
  lines.push({
    kind: 'header',
    key: LINE_KEY.header,
    args: [
      sender?.display ?? '',
      sender?.address ?? '',
      message.subject ?? '',
      message.date ?? '',
    ],
  })

  const nothingRan = verdict.notRun.length === CHECKS.length
  lines.push({
    kind: 'verdict',
    key: nothingRan ? NOTHING_KEY.unchecked : VERDICT_KEY[verdict.severity],
    args: [],
  })

  for (const signal of verdict.signals) {
    lines.push({ kind: 'signal', key: signal.code, args: [] })
    for (const fact of signal.facts) {
      // Two halves of a mismatch belong on adjacent rows, never inside one
      // sentence: the whole point of showing both is that they can be compared.
      lines.push({ kind: 'fact', key: fact.label, args: [fact.value] })
    }
  }

  /**
   * What ran and found nothing, listed even when everything is clean.
   *
   * SCR-21's empty state refuses a bare "clean": an answer with no account of
   * its own coverage cannot be weighed, and this surface has more absent checks
   * than any other in the product.
   */
  const gaps = new Set(verdict.notRun.map((n) => n.check))
  for (const signalled of new Set(verdict.signals.map((s) => s.check))) gaps.add(signalled)
  for (const check of CHECKS) {
    if (!gaps.has(check)) lines.push({ kind: 'checked', key: CHECK_KEY[check], args: [] })
  }

  for (const gap of verdict.notRun) {
    lines.push({ kind: 'not-run', key: LINE_KEY.notRun, args: [CHECK_KEY[gap.check], gap.why] })
  }

  if (verdict.truncated) lines.push({ kind: 'truncated', key: LINE_KEY.truncated, args: [] })

  lines.push(
    verdict.review === null
      ? { kind: 'review', key: REVIEW_KEY.none, args: [] }
      : {
          kind: 'review',
          key: REVIEW_KEY[verdict.review.ran],
          args: [verdict.review.reviewer, verdict.review.summary],
        },
  )

  return lines
}
