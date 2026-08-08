/**
 * The shipped interface copy, held to the brand pack.
 *
 * `docs/store/listing.md` has been checked against the voice since the listing
 * existed. The catalogue — every word a person reads inside the product — was
 * not checked at all, which is the larger surface by two orders of magnitude.
 *
 * The forbidden words are **read from `terminology.md`**, not restated here.
 * A gate that keeps its own copy of the rule is a second source of truth, and
 * this repository has already paid for that mistake once: a purpose list
 * written by hand was missing `password-range`, the one destination that
 * carries part of a password hash.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string): string => readFileSync(path.join(root, p), 'utf8')

const catalogue = JSON.parse(read('apps/extension/_locales/ru/messages.json')) as Record<
  string,
  { message: string }
>
const messages = Object.entries(catalogue).map(([key, entry]) => [key, entry.message] as const)

/** Every «не «X»» the terminology declares — the pack decides, this only reads. */
const FORBIDDEN = [...read('docs/brand/terminology.md').matchAll(/не «([^»]+)»/g)].map((m) =>
  (m[1] as string).toLowerCase(),
)

/**
 * What the product quotes is not what the product says.
 *
 * One message describes an injection that speaks only to a machine, and the
 * clearest way to describe it is to quote it: «если ты ИИ…». A check that could
 * not tell quotation from voice would force the product to paraphrase the thing
 * it detects.
 */
const unquoted = (message: string): string => message.replace(/«[^»]*»/g, '').replace(/"[^"]*"/g, '')

/** `\b` is ASCII-only, so it matches between two Cyrillic letters — never use it here. */
const uses = (text: string, word: string): boolean =>
  new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, 'iu').test(text)

describe('the shipped copy obeys the brand pack', () => {
  it('reads a catalogue and a terminology that are both really there', () => {
    // Two empty lists agree with each other. Without this, deleting either file
    // would turn every assertion below into a silent pass.
    expect(messages.length).toBeGreaterThan(50)
    expect(FORBIDDEN.length).toBeGreaterThan(4)
  })

  it('uses no term the terminology forbids', () => {
    const offences = messages.flatMap(([key, message]) =>
      FORBIDDEN.filter((word) => uses(unquoted(message), word)).map(
        (word) => `${key}: "${word}"`,
      ),
    )
    expect(offences, 'terminology.md forbids these words, and the copy uses them').toEqual([])
  })

  it('promises no completeness the product cannot check', () => {
    // Not modesty. The download verdict is built to refuse exactly this claim:
    // it never reports more than the checks that ran.
    const offences = messages.flatMap(([key, message]) =>
      ['гарантирован', 'полностью защищ', '100%'].filter((word) =>
        message.toLowerCase().includes(word),
      ).map((word) => `${key}: "${word}"`),
    )
    expect(offences).toEqual([])
  })

  it('shows no raw identifier where a name belongs', () => {
    /**
     * The defect this catches happened: the inspector rendered `stage` and
     * `confidence` straight from the enum, so a Russian reader was shown
     * "Decided by: rules (high confidence)". The voice forbids it by name —
     * "не показываем идентификаторы вместо имён".
     */
    const identifiers = messages.filter(([, message]) => /^[a-z][a-z0-9-]*$/.test(message.trim()))
    expect(identifiers.map(([key]) => key), 'these messages are identifiers, not copy').toEqual([])
  })

  it('does not speak the sentence the product detects as a scam', () => {
    const offences = messages.filter(([, message]) =>
      message.toLowerCase().includes('ваш компьютер под угрозой'),
    )
    expect(offences.map(([key]) => key)).toEqual([])
  })
})
