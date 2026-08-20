import { explained, resolveArgs, t } from '@okolos/i18n'
import type { FrameLine } from '@okolos/contracts'

/**
 * The words for a leak verdict, in one place, for the reason the credential words are:
 * there are two surfaces now.
 *
 * Until B-80 the submit check stood under `if (isTopFrame)`, so a password submitted from
 * an iframe was never checked and no second reader existed. It reports upward now, and
 * the sentence has to be built by whoever draws it. Two wording sites for one verdict is
 * how the two drift.
 *
 * `*_KEY` tables rather than a computed key, because that is the form the locale gate
 * reads; a computed one would make every message here look dead to it (B-75).
 */

const PASSWORD_EXPLAIN_KEY: Record<string, string> = {
  'in-common-list': 'pwdExplainCommon',
  unreachable: 'pwdExplainUnreachable',
  unreadable: 'pwdExplainUnreadable',
  absent: 'pwdExplainAbsent',
  found: 'pwdExplainFound',
}

/**
 * Which source answered — the local corpus or the range query.
 *
 * A `*_KEY` table rather than a ternary over two literals, and that is not decoration:
 * `tools/locales.test.ts` sees a key only in four shapes — a literal handed to the
 * resolver, a literal handed to the journal's builder, a field whose name ends in `Key`,
 * or a table whose name ends in `_KEY` — and a key returned from a function is none of
 * them. Written as a ternary first, both messages read to the gate as translated and
 * never shown, which is the gate working and the third time this convention has been
 * broken by hand (B-75).
 */
const PASSWORD_SOURCE_KEY: Record<'offline' | 'online', string> = {
  offline: 'warnPasswordSourceOffline',
  online: 'warnPasswordSourceOnline',
}

/** Which source answered. A key rather than a sentence, so the surface words it. */
export function passwordSourceKey(offline: boolean): string {
  return offline ? PASSWORD_SOURCE_KEY.offline : PASSWORD_SOURCE_KEY.online
}

export interface PasswordVerdict {
  readonly explain: { code: string; detail?: string; count?: number }
  readonly reusedOn: readonly string[]
  readonly reuseUnknown: boolean
}

/**
 * The verdict as two lines: what the check found, then where else the password is used.
 *
 * Appended rather than replacing each other — "this password is in a breach" and "you use
 * it in four places" are two facts, and the second is what turns the first into something
 * to do this evening.
 *
 * **The count travels as a number and is formatted here**, with no locale argument, so the
 * runtime's own separator is used. It used to cross the RPC already formatted by
 * `toLocaleString('en')`: an English thousands separator chosen inside a package that has
 * no business knowing the reader's locale (B-75).
 */
export function passwordLines(verdict: PasswordVerdict): FrameLine[] {
  const code = verdict.explain.code
  const key = PASSWORD_EXPLAIN_KEY[code] ?? code
  const found =
    code === 'unreachable'
      ? explained(key, [verdict.explain.detail ?? ''])
      : code === 'found'
        ? explained(key, [(verdict.explain.count ?? 0).toLocaleString()])
        : explained(key, [])

  return [found, reuseLine(verdict)]
}

/**
 * "Not seen anywhere else" and "never seen at all" are different sentences.
 *
 * A fresh install knows nothing, and a panel that reads its own emptiness as reassurance
 * is the reason the "Check reuse" control was removed for two releases rather than left
 * answering from a store that did not exist.
 */
function reuseLine(verdict: PasswordVerdict): FrameLine {
  if (verdict.reuseUnknown) return explained('warnPasswordReuseUnknown', [])
  if (verdict.reusedOn.length === 0) return explained('warnPasswordReuseNone', [])
  return explained('warnPasswordReuse', [
    String(verdict.reusedOn.length),
    verdict.reusedOn.join(', '),
  ])
}

/** One line, in the reader's language now rather than as it was written. */
export function passwordSentence(line: FrameLine): string {
  return t(line.explainKey, ...resolveArgs(line.explainArgs, line.explainArgKeys))
}

/** Every line, as the banner's detail paragraph. */
export function passwordDetail(lines: readonly FrameLine[]): string {
  return lines.map(passwordSentence).filter(Boolean).join(' ')
}
