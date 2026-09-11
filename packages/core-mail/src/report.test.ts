import { describe, expect, it } from 'vitest'

import { buildReport } from './report.js'
import { CHECKS, assembleVerdict } from './verdict.js'
import type { CheckId, CheckOutcome, MailVerdict } from './verdict.js'
import type { MailMessage } from './types.js'

const message = {
  headers: new Map(),
  subject: 'Счёт на оплату',
  from: [{ display: 'Банк', address: 'a@b.test', domain: 'b.test', raw: 'Банк <a@b.test>' }],
  to: [],
  cc: [],
  replyTo: [],
  date: 'Tue, 09 Sep 2026 10:00:00 +0000',
  text: 'x',
  html: null,
  attachments: [],
  truncated: false,
} satisfies MailMessage

const allRan = (): Map<CheckId, CheckOutcome> =>
  new Map(CHECKS.map((c) => [c, { ran: true, signals: [] }]))

const kinds = (v: MailVerdict): string[] => buildReport(message, v).map((l) => l.kind)

describe('the verdict a person reads', () => {
  it('opens by identifying which message this is', () => {
    const lines = buildReport(message, assembleVerdict(allRan(), { truncated: false }))
    expect(lines[0]?.kind).toBe('header')
    expect(lines[0]?.args).toContain('a@b.test')
    expect(lines[0]?.args).toContain('Счёт на оплату')
  })

  /**
   * Cross-screen rule, and easiest to break in a terminal: severity is a word.
   * The key carries it, so it survives a stream that is not a TTY.
   */
  it('carries the severity as a word, not as a decoration', () => {
    const outcomes = allRan()
    outcomes.set('links', {
      ran: true,
      signals: [{ check: 'links', severity: 'critical', code: 'linkTextMismatch', facts: [] }],
    })
    const verdict = assembleVerdict(outcomes, { truncated: false })
    const line = buildReport(message, verdict).find((l) => l.kind === 'verdict')
    expect(line?.key).toBe('mailVerdictCritical')
  })

  /**
   * Found by running the command, not by reading the diff. A verdict line
   * saying "nothing found" above four lines saying nothing was checked is the
   * bare clean this screen exists to refuse.
   */
  it('says nothing ran, rather than nothing was found, when no check ran', () => {
    const outcomes = new Map<CheckId, CheckOutcome>(
      CHECKS.map((c) => [c, { ran: false, why: 'notBuilt' }]),
    )
    const line = buildReport(message, assembleVerdict(outcomes, { truncated: false })).find(
      (l) => l.kind === 'verdict',
    )
    expect(line?.key).toBe('mailVerdictUnchecked')
  })

  it('nothing found still lists what was checked — a bare clean is refused', () => {
    const lines = buildReport(message, assembleVerdict(allRan(), { truncated: false }))
    expect(lines.filter((l) => l.kind === 'checked')).toHaveLength(CHECKS.length)
  })
})

describe('what did not run is carried, and carried after the signals', () => {
  const withGap = (): MailVerdict => {
    const outcomes = allRan()
    outcomes.set('attachments', { ran: false, why: 'mailSkipParserRefused' })
    outcomes.set('links', {
      ran: true,
      signals: [{ check: 'links', severity: 'minor', code: 'linkTextMismatch', facts: [] }],
    })
    return assembleVerdict(outcomes, { truncated: false })
  }

  it('renders one line per check that did not run, dropping none', () => {
    const outcomes = allRan()
    for (const c of CHECKS) outcomes.set(c, { ran: false, why: `why-${c}` })
    const notRun = buildReport(message, assembleVerdict(outcomes, { truncated: false })).filter(
      (l) => l.kind === 'not-run',
    )
    expect(notRun).toHaveLength(CHECKS.length)
  })

  it('puts the signals first and the gaps after them, never interleaved', () => {
    const order = kinds(withGap())
    expect(order.lastIndexOf('signal')).toBeLessThan(order.indexOf('not-run'))
  })

  it('says the message itself was only partly read', () => {
    expect(kinds(assembleVerdict(allRan(), { truncated: true }))).toContain('truncated')
  })
})

describe('who reviewed it', () => {
  it('says the review did not run when there was none', () => {
    const line = buildReport(message, assembleVerdict(allRan(), { truncated: false })).find(
      (l) => l.kind === 'review',
    )
    expect(line?.key).toBe('mailReviewNone')
  })

  it('names the reviewer and where it ran', () => {
    const verdict: MailVerdict = {
      ...assembleVerdict(allRan(), { truncated: false }),
      review: { reviewer: 'ollama:qwen', ran: 'local', severity: 'none', summary: 'fine' },
    }
    const line = buildReport(message, verdict).find((l) => l.kind === 'review')
    expect(line?.key).toBe('mailReviewLocal')
    expect(line?.args).toContain('ollama:qwen')
  })
})
