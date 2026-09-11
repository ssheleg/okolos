import { describe, expect, it } from 'vitest'

import { LIMITS, parseMessage } from './parse.js'
import type { MailMessage, ParseFailure, ParseOutcome } from './types.js'

const crlf = (lines: readonly string[]): string => lines.join('\r\n')

/**
 * Unwraps a parse, or fails the test.
 *
 * Written this way because `tools/test-quality.test.ts` refuses an assertion
 * behind a branch, and it is right to: `if (!out.ok) return` makes a test that
 * quietly passes when the parse fails, which is the one outcome the test exists
 * to notice. Throwing gives TypeScript the same narrowing without buying it
 * with an escape hatch.
 */
function parsed(outcome: ParseOutcome): MailMessage {
  if (!outcome.ok) throw new Error(`expected a parsed message, got ${outcome.reason.code}`)
  return outcome.message
}

/** The mirror: unwraps a refusal, or fails. */
function refused(outcome: ParseOutcome): ParseFailure {
  if (outcome.ok) throw new Error('expected a refusal, got a parsed message')
  return outcome.reason
}

const plain = crlf([
  'From: "Банк Открытие" <no-reply@example.com>',
  'To: someone@example.org',
  'Subject: Hello',
  'Date: Tue, 09 Sep 2026 10:00:00 +0000',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Body text.',
  '',
])

/** The `.emlx` shape: a byte count, the message, then Apple's own plist. */
const emlx = (body: string, count?: number): string =>
  `${count ?? Buffer.byteLength(body, 'utf8')}\n${body}<?xml version="1.0" encoding="UTF-8"?>\n` +
  '<plist version="1.0"><dict><key>flags</key><integer>8623489</integer></dict></plist>\n'

describe('a message this product can read', () => {
  it('reads the headers and the body of an ordinary message', () => {
    const message = parsed(parseMessage(plain))
    expect(message.subject).toBe('Hello')
    expect(message.text).toBe('Body text.')
    expect(message.from[0]?.address).toBe('no-reply@example.com')
    expect(message.from[0]?.display).toBe('Банк Открытие')
    expect(message.from[0]?.domain).toBe('example.com')
  })

  it('reads the Apple form, and the plist that follows the message is not body', () => {
    const message = parsed(parseMessage(emlx(plain)))
    expect(message.subject).toBe('Hello')
    expect(message.text).toBe('Body text.')
    expect(message.text).not.toContain('plist')
  })

  /**
   * The count is the one integrity check the format carries, and a mismatch is
   * the shape a truncated or tampered file takes. Standing instruction 3: this
   * may not read as a pass.
   */
  it('refuses an Apple form whose declared length does not match', () => {
    expect(refused(parseMessage(emlx(plain, 999999))).code).toBe('emlx-length-mismatch')
  })

  it('unfolds a header continued on the next line', () => {
    const message = parsed(
      parseMessage(crlf(['From: a@b.test', 'Subject: one', ' and the same line', '', 'x', ''])),
    )
    expect(message.subject).toBe('one and the same line')
  })

  it('decodes an encoded word, because a subject is where the brand name sits', () => {
    const message = parsed(
      parseMessage(crlf(['From: a@b.test', 'Subject: =?UTF-8?B?0J/QsNGA0L7Qu9GM?=', '', 'x', ''])),
    )
    expect(message.subject).toBe('Пароль')
  })

  it('keeps a display name that contains a comma as one address', () => {
    const message = parsed(
      parseMessage(crlf(['From: "Bank, N.A." <x@y.test>', 'Subject: s', '', 'b', ''])),
    )
    expect(message.from).toHaveLength(1)
    expect(message.from[0]?.display).toBe('Bank, N.A.')
  })

  it('separates the text part from the html part', () => {
    const message = parsed(
      parseMessage(
        crlf([
          'From: a@b.test',
          'Subject: s',
          'Content-Type: multipart/alternative; boundary="B"',
          '',
          '--B',
          'Content-Type: text/plain',
          '',
          'plain side',
          '--B',
          'Content-Type: text/html',
          '',
          '<p>html side</p>',
          '--B--',
          '',
        ]),
      ),
    )
    expect(message.text).toBe('plain side')
    expect(message.html).toBe('<p>html side</p>')
  })

  it('finds an attachment nested two levels down, with its name as stored', () => {
    const message = parsed(
      parseMessage(
        crlf([
          'From: a@b.test',
          'Subject: s',
          'Content-Type: multipart/mixed; boundary="OUT"',
          '',
          '--OUT',
          'Content-Type: multipart/alternative; boundary="IN"',
          '',
          '--IN',
          'Content-Type: text/plain',
          '',
          'hi',
          '--IN--',
          '--OUT',
          'Content-Type: application/pdf; name="invoice.pdf"',
          'Content-Disposition: attachment; filename="invoice.pdf"',
          'Content-Transfer-Encoding: base64',
          '',
          Buffer.from('%PDF-1.7 fake').toString('base64'),
          '--OUT--',
          '',
        ]),
      ),
    )
    expect(message.text).toBe('hi')
    expect(message.attachments).toHaveLength(1)
    expect(message.attachments[0]?.filename).toBe('invoice.pdf')
    expect(message.attachments[0]?.declaredType).toBe('application/pdf')
    expect(Buffer.from(message.attachments[0]?.bytes ?? []).toString()).toBe('%PDF-1.7 fake')
  })
})

describe('a message this product cannot read says so', () => {
  it('refuses an empty file', () => {
    expect(refused(parseMessage('')).code).toBe('empty')
  })

  it('refuses a file with no headers at all', () => {
    expect(refused(parseMessage('just some text with no colon line\r\n')).code).toBe('no-headers')
  })

  it('refuses a file past the size ceiling instead of reading part of it', () => {
    expect(refused(parseMessage(`${plain}${'x'.repeat(LIMITS.bytes)}`)).code).toBe('too-large')
  })
})

describe('the budget is a count, never a clock', () => {
  /**
   * The browser side learned this at the cost of four red CI runs (B-110): a
   * traversal bounded by wall clock gives up on a seven-node page when the
   * machine is busy, and a security check that abandons itself under load is
   * the one thing it may not do. The ceiling here is parts and depth, and
   * reaching either is reported rather than hidden.
   */
  it('stops at the part ceiling and says the message was only partly read', () => {
    const parts = Array.from({ length: LIMITS.parts + 5 }, (_, i) =>
      crlf(['--B', 'Content-Type: text/plain', '', `part ${i}`]),
    )
    const message = parsed(
      parseMessage(
        crlf([
          'From: a@b.test',
          'Subject: s',
          'Content-Type: multipart/mixed; boundary="B"',
          '',
          ...parts,
          '--B--',
          '',
        ]),
      ),
    )
    expect(message.truncated).toBe(true)
  })

  /**
   * Found by a planted defect, not by design. The first plant against the part
   * ceiling passed with the flag removed, because the flag is set in two places
   * and the ceiling test exercises only one of them — so the depth guard was
   * covered by nothing at all. Standing instruction 1 is about exactly this:
   * confirm the plant landed on the rule you meant to test.
   */
  it('stops at the depth ceiling and says the message was only partly read', () => {
    let nested = crlf(['Content-Type: text/plain', '', 'bottom'])
    for (let level = 0; level <= LIMITS.depth + 2; level += 1) {
      const boundary = `B${level}`
      nested = crlf([
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        nested,
        `--${boundary}--`,
      ])
    }
    const message = parsed(parseMessage(crlf(['From: a@b.test', 'Subject: s', nested])))
    expect(message.truncated).toBe(true)
  })

  it('a message inside the ceiling is not marked truncated', () => {
    expect(parsed(parseMessage(plain)).truncated).toBe(false)
  })
})
