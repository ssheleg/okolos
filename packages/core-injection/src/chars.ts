/**
 * What invisible characters are *doing*, as opposed to whether any are present.
 *
 * The detector used to treat presence as the finding: any character in a
 * zero-width, tag or bidi-control range made the text anomalous, and one
 * anomalous candidate was enough to rewrite the page. Measured 2026-08-20, that
 * flagged a family emoji, a Scottish flag, a Persian word, a Hebrew sentence
 * with a Latin brand in it, and a phone number in a right-to-left wrapper —
 * five writing systems reported as prompt injection.
 *
 * The characters are not the attack. Their placement is. A zero-width joiner
 * between two emoji is what makes the emoji; the same character between the `i`
 * and the `g` of "ignore" exists to stop a matcher seeing the word. A
 * right-to-left *isolate* around a phone number is how bidirectional text is
 * supposed to be written; a right-to-left *override* reverses what a reader
 * sees and is a spoofing primitive with no honest use. So this module asks
 * where each character sits and what it does there, and reports only what has
 * no innocent reading.
 *
 * Every character is written as an escape. A literal zero-width character in
 * source is invisible to the reviewer, which is the exact trick being caught —
 * the lint rule that forbids them here is doing the right thing.
 */

export type Anomaly =
  /** A zero-width character inside a word of a script that does not join. */
  | 'word-splitter'
  /** U+202D/U+202E: reverses the order a reader sees. No honest use. */
  | 'bidi-override'
  /** An embedding or isolate that never closes, so it leaks into the rest. */
  | 'bidi-unbalanced'
  /** Tag characters outside the one sequence that uses them: a flag. */
  | 'tag-sequence'
  /** A joiner or invisible operator standing where nothing joins. */
  | 'invisible-operator'

const ZWSP = '\u200B'
const ZWNJ = '\u200C'
const ZWJ = '\u200D'
const LRE = '\u202A'
const RLE = '\u202B'
const PDF = '\u202C'
const LRO = '\u202D'
const RLO = '\u202E'
const LRI = '\u2066'
const RLI = '\u2067'
const FSI = '\u2068'
const PDI = '\u2069'
const BOM = '\uFEFF'
const BLACK_FLAG = '\u{1F3F4}'
const TAG_TERMINATOR = '\u{E007F}'

const ZERO_WIDTH = new Set([ZWSP, ZWNJ, ZWJ, '\u2060'])
/**
 * The invisible maths operators, and a byte-order mark out of place.
 *
 * U+2060 WORD JOINER is deliberately not here: like the zero-width family it is
 * typography — it marks where a line may *not* break, the way U+200B marks where
 * it may — so it is judged by the same placement rule below. What is left has no
 * typographic use in prose at all: invisible function application, invisible
 * times, separator and plus exist inside mathematical notation, and a BOM in the
 * middle of a sentence is a channel rather than a file artefact.
 */
const INVISIBLE_OPERATORS = new Set(['\u2061', '\u2062', '\u2063', '\u2064', BOM])

/**
 * Letters of scripts that separate words with spaces.
 *
 * The splitter rule is about them and only them, and the reason is what the
 * splitter is *for*: hiding a word from a matcher whose patterns are written in
 * one of these scripts. A zero-width space between two Han ideographs or two
 * Thai letters is a line-break opportunity in a script that has no spaces to
 * break at — there is no word being split, and there is no rule it could hide
 * from. Treating those as attacks reported Japanese and Thai as prompt
 * injection.
 */
const SPACED_LETTER =
  /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}\p{Script=Georgian}\p{Script=Hebrew}]/u

/**
 * The limit this list draws, stated rather than left to be discovered.
 *
 * Arabic, Persian and the Indic scripts are space-separated too, and they are
 * deliberately absent: in those scripts a zero-width non-joiner **between two
 * letters of a word** is the orthography — "نمی‌خواهم" is spelled that way — and
 * it is also exactly the shape a splitter attack takes. No placement test can
 * separate the two, so a splitter hidden inside an Arabic or Hindi word is not
 * reported. The alternative is reporting the language, which is what this module
 * was written to stop. Pinned by a test in `chars.test.ts` so the gap is a
 * decision.
 */
const TAG_CHAR = /[\u{E0000}-\u{E007F}]/u

/** Opens a bidi run; the value is what closes it. */
const OPENERS: Readonly<Record<string, string>> = {
  [LRE]: PDF,
  [RLE]: PDF,
  [LRO]: PDF,
  [RLO]: PDF,
  [LRI]: PDI,
  [RLI]: PDI,
  [FSI]: PDI,
}

/**
 * Reports what has no innocent reading, in the order the kinds are declared.
 *
 * Deduplicated: three split words are one finding about the text, and a count
 * of characters would say more about the sentence's length than about the
 * attack.
 */
export function anomaliesOf(text: string): readonly Anomaly[] {
  const points = Array.from(text)
  const found = new Set<Anomaly>()
  const openRuns: string[] = []

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i] as string
    const before = points[i - 1]
    const after = points[i + 1]

    if (ZERO_WIDTH.has(point)) {
      /**
       * A zero-width character between two letters of a space-separated script
       * is there to break a word in half for a matcher while leaving it whole
       * for a reader. Everywhere else it is typography.
       *
       * There was a second guard here — an exemption for emoji sequences and for
       * scripts whose shaping needs a joiner — and a plant proved it unreachable:
       * an emoji is not a letter of any script in `SPACED_LETTER`, and neither is
       * a Persian or Devanagari one, so the placement rule had already excluded
       * both. A guard that cannot fire reads as protection and is not any, so it
       * was removed rather than left for the next reader to trust.
       */
      if (
        before !== undefined &&
        after !== undefined &&
        SPACED_LETTER.test(before) &&
        SPACED_LETTER.test(after)
      ) {
        found.add('word-splitter')
      }
      // Anywhere else it is typography and reported as nothing: after a slash in
      // a long URL, between two ideographs, beside a space. A break opportunity
      // in a script that has no spaces hides no word from any rule here.
      continue
    }

    if (point === LRO || point === RLO) {
      found.add('bidi-override')
      openRuns.push(PDF)
      continue
    }

    const closes = OPENERS[point]
    if (closes !== undefined) {
      openRuns.push(closes)
      continue
    }

    if (point === PDF || point === PDI) {
      const expected = openRuns[openRuns.length - 1]
      if (expected === point) openRuns.pop()
      // A close with nothing open, or closing the wrong kind, is the same
      // leak as never closing: the run below it is now unterminated.
      else found.add('bidi-unbalanced')
      continue
    }

    if (TAG_CHAR.test(point)) {
      // The one sequence that uses tag characters is a subdivision flag:
      // a black flag, tag letters, then the terminator. Anything else is a
      // channel that survives copy-paste and is invisible everywhere.
      if (!inFlagSequence(points, i)) found.add('tag-sequence')
      continue
    }

    if (INVISIBLE_OPERATORS.has(point)) {
      // A byte-order mark opening the text is a file artefact, not a message.
      if (point === BOM && i === 0) continue
      found.add('invisible-operator')
    }
  }

  if (openRuns.length > 0) found.add('bidi-unbalanced')

  return [...found]
}

/** True when the tag character at `i` belongs to a flag that opened and closes. */
function inFlagSequence(points: readonly string[], i: number): boolean {
  let start = i
  while (start > 0 && TAG_CHAR.test(points[start - 1] as string)) start -= 1
  if (points[start - 1] !== BLACK_FLAG) return false

  let end = i
  while (end < points.length && TAG_CHAR.test(points[end] as string)) end += 1
  return points[end - 1] === TAG_TERMINATOR
}
