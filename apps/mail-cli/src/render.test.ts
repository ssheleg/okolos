import { describe, expect, it } from 'vitest'

import { fromCatalogue } from '@okolos/i18n'
import { buildReport, assembleVerdict, CHECKS } from '@okolos/core-mail'
import type { CheckId, CheckOutcome, MailMessage } from '@okolos/core-mail'

import { render } from './render.js'

const t = fromCatalogue({
  mailHeader: {
    message: 'OT $A$ <$B$> - $C$ - $D$',
    placeholders: { a: { content: '$1' }, b: { content: '$2' }, c: { content: '$3' }, d: { content: '$4' } },
  },
  mailVerdictNone: { message: 'ничего не найдено' },
  mailVerdictUnchecked: { message: 'ни одна проверка не выполнена' },
  mailVerdictMinor: { message: 'незначительно' },
  mailNotRun: {
    message: 'НЕ ПРОВЕРЯЛОСЬ: $A$ - $B$',
    placeholders: { a: { content: '$1' }, b: { content: '$2' } },
  },
  mailCheckSender: { message: 'отправитель' },
  mailCheckLinks: { message: 'ссылки' },
  mailCheckHidden: { message: 'скрытый текст' },
  mailCheckAttachments: { message: 'вложения' },
  mailReviewNone: { message: 'ревизия не проводилась' },
  mailSkipNotBuilt: { message: 'проверка ещё не построена' },
})

const message: MailMessage = {
  headers: new Map(),
  subject: 'Тема',
  from: [{ display: 'Кто-то', address: 'a@b.test', domain: 'b.test', raw: 'x' }],
  to: [],
  cc: [],
  replyTo: [],
  date: 'd',
  text: null,
  html: null,
  attachments: [],
  truncated: false,
}

const allRan = (): Map<CheckId, CheckOutcome> =>
  new Map(CHECKS.map((c) => [c, { ran: true, signals: [] }]))

const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')

describe('the terminal surface', () => {
  it('prints the severity as a word even when the stream is not a terminal', () => {
    const out = render(buildReport(message, assembleVerdict(allRan(), { truncated: false })), t, {
      colour: false,
    })
    expect(out).toContain('ничего не найдено')
  })

  /**
   * The one rule a terminal makes easiest to break. Colour is allowed as a
   * third signal beside the word; it is never the signal itself.
   */
  it('carries the same words with colour on and with colour off', () => {
    const report = buildReport(message, assembleVerdict(allRan(), { truncated: false }))
    const coloured = render(report, t, { colour: true }).replace(ANSI, '')
    expect(coloured).toBe(render(report, t, { colour: false }))
  })

  it('names a missing key visibly rather than printing a blank line', () => {
    const outcomes = allRan()
    outcomes.set('sender', {
      ran: true,
      signals: [{ check: 'sender', severity: 'minor', code: 'noSuchKey', facts: [] }],
    })
    const out = render(buildReport(message, assembleVerdict(outcomes, { truncated: false })), t, {
      colour: false,
    })
    expect(out).toContain('[noSuchKey]')
  })

  it('prints every check that did not run, with its reason', () => {
    const outcomes = new Map<CheckId, CheckOutcome>(
      CHECKS.map((c) => [c, { ran: false, why: 'mailSkipNotBuilt' }]),
    )
    const out = render(buildReport(message, assembleVerdict(outcomes, { truncated: false })), t, {
      colour: false,
    })
    for (const label of ['отправитель', 'ссылки', 'скрытый текст', 'вложения']) {
      expect(out).toContain(label)
    }
    expect(out.match(/НЕ ПРОВЕРЯЛОСЬ/g)).toHaveLength(CHECKS.length)
  })
})
