import { explained, resolveArgs, t } from '@okolos/i18n'
import type { CredentialWarning } from '@okolos/core-credential'
import type { FrameLine } from '@okolos/contracts'

/**
 * The words for a password warning, in one place, because there are now two surfaces.
 *
 * Until B-79 the watcher worded its own banner and nothing else could: a login form in
 * an iframe was watched by nobody, so no second reader existed. Now a subframe hands its
 * finding to the page that embeds it, and the sentence has to be built by whoever draws
 * it — the top frame — from facts the frame sent. Two wording sites for one warning is
 * how the two drift; one module with the tables in it is the fix.
 *
 * `*_KEY` tables rather than a computed key, because that is the form the locale gate
 * reads; a computed one would make all seven messages look dead to it (B-75).
 */

const FACT_KEY: Record<string, string> = {
  'not-encrypted': 'credFactNotEncrypted',
  imitates: 'credFactImitates',
  'posts-elsewhere': 'credFactPostsElsewhere',
  'first-day': 'credFactFirstDay',
  'seen-for-days': 'credFactSeenForDays',
}

const UNKNOWN_KEY: Record<string, string> = {
  'how-long-visited': 'credUnknownHowLong',
  'when-registered': 'credUnknownWhenRegistered',
}

/**
 * The warning as lines a surface can word, one per fact plus one for the unknowns.
 *
 * An unresolvable code travels as its own key and renders as `[code]` — bracketed and
 * visible, which is what every other missing message in this product looks like. Wrong
 * and visible beats invisible: a fact silently dropped is a warning that under-states
 * itself.
 *
 * **The unknown list is worded here, deliberately, and it is the one exception.** Its
 * message holds several of our own words in a single position, and `explainArgKeys` marks
 * a position as a message, not a list of them. Resolving it at the frame is safe in a way
 * the journal's arguments were not (B-77): this line crosses a frame boundary inside one
 * session, not a time boundary — the reader cannot switch language between the frame
 * building it and the top frame drawing it.
 */
export function credentialLines(warning: CredentialWarning): FrameLine[] {
  const lines = warning.facts.map((fact) => {
    const key = FACT_KEY[fact.code] ?? fact.code
    if (fact.code === 'imitates') return explained(key, [fact.resembles])
    if (fact.code === 'posts-elsewhere') return explained(key, [fact.postsTo, fact.host])
    if (fact.code === 'seen-for-days') return explained(key, [String(fact.days)])
    return explained(key, [])
  })

  if (warning.missing.length > 0) {
    const named = warning.missing
      .map((unknown) => {
        const key = UNKNOWN_KEY[unknown.code]
        return key === undefined ? unknown.code : t(key)
      })
      .join('; ')
    lines.push(explained('warnCredentialUnknown', [named]))
  }

  return lines
}

/** One line, in the reader's language now rather than as it was written. */
export function credentialSentence(line: FrameLine): string {
  return t(line.explainKey, ...resolveArgs(line.explainArgs, line.explainArgKeys))
}

/** Every line, as the banner's detail paragraph. */
export function credentialDetail(lines: readonly FrameLine[]): string {
  return lines.map(credentialSentence).filter(Boolean).join(' ')
}
