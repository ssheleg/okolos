import type { Refusal } from '@okolos/core-feeds'
import { displayFeedName, OUR_FEEDS, type FeedSnapshot } from '@okolos/core-feeds'
import { explained, t, type ExplainArg, type Explained } from '@okolos/i18n'

/**
 * The words for a feed update that was refused, or one that landed.
 *
 * `core-feeds` composed them itself until 2026-08-20: one English sentence per refusal
 * reason, beside a `reason` code that already said the same thing (B-75). The sentence
 * went into the journal, and `exportAll` puts the journal into the file the user
 * downloads — English copy on a surface a person reads. The code travels; the words are
 * here, in the worker, which does have a catalogue.
 *
 * Its own module because `background/index.ts` registers listeners at import, so nothing
 * in it can be called from a test — and a refusal nobody can read back is how a feed
 * that quietly stopped updating passes for one with nothing new to say.
 */

/**
 * One key per reason. A literal table, so the locale gate sees every message as live.
 *
 * Indexed through `keyFor` rather than directly: with `noUncheckedIndexedAccess` a
 * `Record` lookup is `string | undefined`, and defaulting that to an empty string would
 * put a blank line in the journal where a refusal belongs.
 */
export const REFUSAL_KEY: Record<Refusal['reason'], string> = {
  'bad-signature': 'feedRefusedSignature',
  'bad-version': 'feedRefusedVersion',
  'wrong-feed': 'feedRefusedWrongFeed',
  'not-newer': 'feedRefusedNotNewer',
  'no-current': 'feedRefusedNoCurrent',
  'wrong-base': 'feedRefusedWrongBase',
}

/**
 * A key with the words already resolved into its arguments, not a finished sentence.
 *
 * `summarise` in the popup resolves `explainKey` at read time, so the reader's language
 * decides how an old journal row reads. Its arguments are stored strings, which is why
 * the feed's own name is resolved here rather than passed as an identifier: `phishing`
 * in a Russian sentence is worse than a name in the language of the day. That the
 * arguments freeze while the sentence does not is recorded as B-77.
 */
function keyFor(reason: Refusal['reason']): string {
  const key = REFUSAL_KEY[reason]
  // Unreachable while the table is a total `Record` over the union — and if a reason is
  // ever added without a message, saying so beats journalling an empty sentence.
  // i18n-exempt: unreachable while the table above is a total `Record` over the union, and the
  // audience of the throw is whoever added a reason without a message — not a user
  if (key === undefined) throw new Error(`no message key for feed refusal "${reason}"`)
  return key
}

export function feedRefusal(refusal: Refusal, kept: FeedSnapshot | null): Explained {
  const explainKey = keyFor(refusal.reason)
  switch (refusal.reason) {
    case 'bad-signature':
      /**
       * Two messages for one reason, and this is the one place that is right.
       *
       * Whether anything survives to fall back on changes what the sentence has to say —
       * "version 7 stays in force" against "there is no earlier copy to fall back to" —
       * and it is not a value that can be substituted into one sentence: with nothing
       * kept, there is no number to put there. The package used to choose between the
       * two English sentences itself; it reports `kept` and the choice is made here.
       */
      return kept === null
        ? explained('feedRefusedSignatureNoFallback', [feedArg(refusal.feed)])
        : explained(explainKey, [feedArg(refusal.feed), String(kept.version)])
    case 'bad-version':
      return explained(explainKey, [feedArg(refusal.feed), refusal.found])
    case 'wrong-feed':
      return explained(explainKey, [feedArg(refusal.feed), feedArg(refusal.current)])
    case 'not-newer':
      return explained(explainKey, [String(refusal.version), String(refusal.current)])
    case 'no-current':
      return explained(explainKey, [feedArg(refusal.feed)])
    case 'wrong-base':
      return explained(explainKey, [String(refusal.base), String(refusal.current)])
  }
}

/** A feed that landed, said in the same shape so the journal reads one way. */
export function feedAccepted(feed: string, version: number): Explained {
  return explained('feedNowAtVersion', [feedArg(feed), String(version)])
}

/**
 * The name a person is shown for one of our lists.
 *
 * `displayFeedNameEn` exists for `apps/proxy`, which serves its pages from a Cloudflare
 * worker with no `_locales` directory. This is the browser extension, which has one —
 * and substituting an English list name into a Russian sentence was the defect that
 * naming the other function "for the worker" made easy to miss.
 */
/**
 * A list we publish is named by a message; anything else is already a name.
 *
 * Returned as an argument rather than as a string, so the journal can resolve it again
 * for a reader who switched language (B-77). `phishing` has a message; a feed somebody
 * else publishes has only the name they gave it, and inventing a translation of that
 * would be inventing a fact.
 */
export const feedArg = (identifier: string): ExplainArg => {
  const known = OUR_FEEDS[identifier]
  return known ? { messageKey: known.messageKey } : (displayFeedName(identifier, t) ?? identifier)
}
