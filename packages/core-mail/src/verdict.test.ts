import { describe, expect, it } from 'vitest'

import { CHECKS, applyReview, assembleVerdict, worstOf } from './verdict.js'
import type { CheckId, CheckOutcome, MailSignal, Review } from './verdict.js'

const ran = (signals: readonly MailSignal[]): CheckOutcome => ({ ran: true, signals })

describe('the verdict is the worst thing that was actually found', () => {
  it('is none when every check ran and found nothing', () => {
    const v = assembleVerdict(
      new Map(CHECKS.map((c) => [c, ran([])])),
      { truncated: false },
    )
    expect(v.severity).toBe('none')
    expect(v.signals).toHaveLength(0)
    expect(v.notRun).toHaveLength(0)
  })

  it('takes the worst severity among the signals', () => {
    const outcomes = new Map<CheckId, CheckOutcome>(CHECKS.map((c) => [c, ran([])]))
    outcomes.set('links', ran([{ check: 'links', severity: 'minor', code: 'x', facts: [] }]))
    outcomes.set('sender', ran([{ check: 'sender', severity: 'critical', code: 'y', facts: [] }]))
    const v = assembleVerdict(outcomes, { truncated: false })
    expect(v.severity).toBe('critical')
  })

  /**
   * Standing instruction 3, and the reason this whole surface exists. A check
   * that did not run is carried, counted, and never folded into "nothing found".
   */
  it('carries every check that did not run, with its reason', () => {
    const outcomes = new Map<CheckId, CheckOutcome>(CHECKS.map((c) => [c, ran([])]))
    outcomes.set('attachments', { ran: false, why: 'parserRefused' })
    const v = assembleVerdict(outcomes, { truncated: false })
    expect(v.severity).toBe('none')
    expect(v.notRun).toEqual([{ check: 'attachments', why: 'parserRefused' }])
  })

  it('treats a check nobody reported as not run, rather than as clean', () => {
    const v = assembleVerdict(new Map<CheckId, CheckOutcome>([['sender', ran([])]]), {
      truncated: false,
    })
    expect(v.notRun.map((n) => n.check).sort()).toEqual(
      CHECKS.filter((c) => c !== 'sender').slice().sort(),
    )
  })

  it('carries the message-was-truncated fact into the verdict', () => {
    const v = assembleVerdict(new Map(CHECKS.map((c) => [c, ran([])])), { truncated: true })
    expect(v.truncated).toBe(true)
  })
})

describe('the reviewer explains and may not escalate', () => {
  const base = assembleVerdict(
    new Map(CHECKS.map((c) => [c, ran([{ check: c, severity: 'minor', code: 'k', facts: [] }])])),
    { truncated: false },
  )

  /** ADR-0004 applied to a new stage: a verdict never outruns its checks. */
  it('refuses a review that raises the severity above what the checks found', () => {
    const louder: Review = { reviewer: 'test', ran: 'local', severity: 'critical', summary: 's' }
    const out = applyReview(base, louder)
    expect(out.severity).toBe('minor')
    expect(out.review?.severity).toBe('minor')
  })

  it('accepts a review that lowers the severity, because quieting noise is its job', () => {
    const quieter: Review = { reviewer: 'test', ran: 'local', severity: 'none', summary: 's' }
    expect(applyReview(base, quieter).severity).toBe('none')
  })

  it('leaves the verdict untouched and says so when no review happened', () => {
    const out = applyReview(base, null)
    expect(out.severity).toBe('minor')
    expect(out.review).toBeNull()
  })
})

describe('worstOf', () => {
  it('orders critical over major over minor over none', () => {
    expect(worstOf(['none', 'minor', 'critical', 'major'])).toBe('critical')
    expect(worstOf(['none', 'minor'])).toBe('minor')
    expect(worstOf([])).toBe('none')
  })
})
