import { describe, expect, it } from 'vitest'

import { fromCatalogue } from '@okolos/i18n'

import { EXIT, scan } from './scan.js'

const t = fromCatalogue({
  mailHeader: {
    message: '$A$ <$B$> $C$ $D$',
    placeholders: { a: { content: '$1' }, b: { content: '$2' }, c: { content: '$3' }, d: { content: '$4' } },
  },
  mailVerdictNone: { message: 'ничего не найдено' },
  mailVerdictUnchecked: { message: 'ни одна проверка не выполнена' },
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
  mailUnreadable: { message: 'ПИСЬМО НЕ ПРОЧИТАНО: $A$', placeholders: { a: { content: '$1' } } },
  mailParseEmpty: { message: 'файл пуст' },
  mailParseNoHeaders: { message: 'это не письмо' },
  mailParseEmlxLengthMismatch: { message: 'длина не сходится' },
  mailParseTooLarge: { message: 'файл слишком велик' },
})

const ok = [
  'From: a@b.test',
  'Subject: s',
  '',
  'body',
  '',
].join('\r\n')

describe('scan, as the command behaves', () => {
  it('reads an ordinary message and reports nothing found', () => {
    const out = scan(ok, t, { colour: false })
    expect(out.code).toBe(EXIT.nothingFound)
    expect(out.text).toContain('ни одна проверка не выполнена')
  })

  /**
   * SCN-038's error path, and the rule the browser side paid for twice: a scan
   * that failed is never a clean result (B-74). The exit code has to separate
   * them too, because a caller that only reads the status is the most likely
   * caller a command line has.
   */
  it('refuses to render a verdict for a message it could not read', () => {
    const out = scan('', t, { colour: false })
    expect(out.code).toBe(EXIT.unreadable)
    expect(out.text).toContain('ПИСЬМО НЕ ПРОЧИТАНО')
    expect(out.text).not.toContain('ни одна проверка не выполнена')
  })

  it('names which way the message was unreadable, not just that it was', () => {
    expect(scan('no colon here at all', t, { colour: false }).text).toContain('это не письмо')
    expect(scan('', t, { colour: false }).text).toContain('файл пуст')
  })

  it('lists every check that has not been built yet, rather than implying it ran', () => {
    const out = scan(ok, t, { colour: false })
    expect(out.text.match(/НЕ ПРОВЕРЯЛОСЬ/g)).toHaveLength(4)
    expect(out.text).toContain('проверка ещё не построена')
  })
})
