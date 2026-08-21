import { describe, expect, it } from 'vitest'
import type { GateDecision, GateReason } from '@okolos/contracts'

import { GATE_REASON_KEY, gateExplain, gateSentence } from './gate-words.js'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fromCatalogue, useResolver, type Catalogue } from '@okolos/i18n'

/**
 * The words for a held action, on the surface that owns them.
 *
 * `core-gate` used to compose these sentences in English and hand them over finished
 * (B-75); the journal keeps them and `exportAll` puts the journal verbatim into the
 * file the user downloads. So they are asserted against the *shipped* Russian
 * catalogue — a fake would let a missing key through, and `[gateReasonTimeout]` in a
 * downloaded file is the defect this move exists to prevent.
 */
const CATALOGUE = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../_locales/ru/messages.json'), 'utf8'),
) as Catalogue

useResolver(fromCatalogue(CATALOGUE))

/** The catalogue's own resolver, so the comparison is not the code compared to itself. */
const CATALOGUE_RESOLVE = (key: string, args: readonly string[]): string =>
  fromCatalogue(CATALOGUE)(key, args)

/**
 * Every reason the contract has.
 *
 * The header used to claim this list fails at compile time when a reason is added to the
 * union, and it did not: `readonly GateReason[]` accepts a list that is short by one, so
 * `already-asking` was caught by the run below instead — a runtime red where a compiler
 * error was promised (B-123). `as const` keeps the element type literal, and the check
 * under it is the promise made good: with a reason missing, `MissingReason` stops being
 * `never` and the assignment does not compile.
 */
const REASONS = [
  'no-finding',
  'human-gesture',
  'unidentified',
  'unavailable',
  'already-asking',
  'timeout',
  'user-allowed',
  'user-blocked',
] as const satisfies readonly GateReason[]

type MissingReason = Exclude<GateReason, (typeof REASONS)[number]>
const REASONS_ARE_COMPLETE: MissingReason extends never ? true : never = true

function decision(overrides: Partial<GateDecision> = {}): GateDecision {
  return {
    actionId: 'act-1',
    outcome: 'blocked',
    reason: 'user-blocked',
    findingIds: ['f1'],
    describes: 'отправку файла на почту',
    ...overrides,
  }
}

describe('every reason the gate can give', () => {
  it('has a key, and the key is in the shipped catalogue', () => {
    // The two halves fail differently: a reason with no key is a crash on the next
    // held action, a key with no message is `[gateReasonX]` in a downloaded file.
    for (const reason of REASONS) {
      const key = GATE_REASON_KEY[reason]
      expect(key, `no key for ${reason}`).toBeTruthy()
      expect(CATALOGUE[key], `the shipped catalogue has no "${key}"`).toBeTruthy()
    }
  })

  it('resolves to a sentence with no placeholder and no bare code left in it', () => {
    for (const reason of REASONS) {
      const sentence = gateSentence(decision({ reason, detail: 'нет окна' }))
      expect(sentence).not.toMatch(/\$[A-Z]+\$/)
      expect(sentence).not.toMatch(/^\[/)
      // A code that reached the screen would read as a sentence of two words with a
      // hyphen in it; the shortest real message here is far longer.
      expect(sentence.length).toBeGreaterThan(30)
      expect(sentence).not.toContain(reason)
    }
  })

  it('gives each reason its own key, and its own sentence', () => {
    /**
     * A planted `timeout: 'gateReasonUserBlocked'` passed every other check in this
     * file: the key exists, the message resolves, it names the action, and the union
     * cover test looks at the reason side of the table. The user would have been told
     * "вы остановили X" about an action nobody answered for — a true sentence about
     * the wrong event, which is the exact failure this whole table exists to avoid.
     *
     * Sentences rather than keys alone: two keys whose messages are identical is the
     * same lie one step further away.
     */
    const keys = Object.values(GATE_REASON_KEY)
    expect(new Set(keys).size, `duplicate key: ${keys.join(', ')}`).toBe(keys.length)

    const sentences = REASONS.map((reason) => gateSentence(decision({ reason, detail: 'нет окна' })))
    expect(new Set(sentences).size).toBe(sentences.length)
  })

  it('covers the union exactly — no key without a reason', () => {
    // A leftover key outlives the reason it was written for, and nothing else notices:
    // the sweep sees it referenced and the catalogue keeps the message forever.
    expect(Object.keys(GATE_REASON_KEY).sort()).toEqual([...REASONS].sort())
    // The compile-time half of the same question, asserted so the compiler counts it as
    // read: this is `true` only while the list above covers the union.
    expect(REASONS_ARE_COMPLETE).toBe(true)
  })
})

/**
 * Four of the eight name the action, and which four is a decision, not an accident.
 *
 * A decision the user made or missed is about *that* action, so it is named — and so is
 * `already-asking`, which is the one case where an action is dropped while the reader is
 * busy with a different one: a record that does not say which action went is a record of
 * nothing they can act on. The other four are about the page or the browser:
 * `no-finding` and `human-gesture` are why nothing was held at all, `unidentified` fires
 * precisely when the action could not be made out — its description may be blank, which
 * is one of the two ways it fires — and `unavailable` is about a window that would not open.
 */
const NAMES_THE_ACTION: readonly GateReason[] = [
  'timeout',
  'user-allowed',
  'user-blocked',
  'already-asking',
]

describe('what each sentence is allowed to name', () => {
  it('names the action for the four reasons that are about the action', () => {
    for (const reason of NAMES_THE_ACTION) {
      expect(gateSentence(decision({ reason }))).toContain('отправку файла на почту')
    }
  })

  it('leaves the action out of the four that are not about it', () => {
    for (const reason of REASONS.filter((r) => !NAMES_THE_ACTION.includes(r))) {
      expect(gateSentence(decision({ reason, detail: 'нет окна' }))).not.toContain(
        'отправку файла на почту',
      )
    }
  })

  it('holds the shipped catalogue to that same split', () => {
    // The two assertions above pass a description in and look for it, so a message that
    // quietly loses its `$ACTION$` would take them with it — both would still agree
    // with the code. This one reads the messages instead: the placeholder is there, or
    // the sentence never had a slot for the action in the first place.
    for (const reason of REASONS) {
      const message = CATALOGUE[GATE_REASON_KEY[reason]]?.message ?? ''
      expect(message.includes('$ACTION$'), `${reason}: $ACTION$`).toBe(
        NAMES_THE_ACTION.includes(reason),
      )
    }
  })

  it("quotes the browser's own words when the surface would not open", () => {
    // The one fact the reason code cannot carry. Translating it would invent a message
    // no browser sent; quoting it lets a reader search for it.
    const sentence = gateSentence(decision({ reason: 'unavailable', detail: 'no window to draw in' }))
    expect(sentence).toContain('no window to draw in')
  })

  it('still resolves when there is no detail to quote', () => {
    // An older journalled decision, or a thrown non-Error: the sentence must not fall
    // back to showing `$CAUSE$` to a person.
    const sentence = gateSentence(decision({ reason: 'unavailable' }))
    expect(sentence).not.toMatch(/\$[A-Z]+\$/)
    expect(sentence.length).toBeGreaterThan(30)
  })

})

describe('what goes into the journal', () => {
  it('is the key and its arguments, not the sentence they make', () => {
    /**
     * `summarise` in the popup resolves `explainKey` at read time, so the reader's
     * language decides. Storing the sentence instead would freeze the language in force
     * when the action was held: switch the browser next month and every old gate line
     * stays in the old language, reading like a failed translation rather than a record.
     */
    const explained = gateExplain(decision({ reason: 'timeout' }))
    expect(explained.explainKey).toBe('gateReasonTimeout')
    expect(explained.explainArgs).toEqual(['отправку файла на почту'])
    expect(explained).not.toHaveProperty('explain')
  })

  it('resolves to exactly what the immediate surface shows', () => {
    // Two paths to one sentence: a stored key resolved later, and a sentence shown now.
    // If they can differ, the journal stops being a record of what the user was told.
    for (const reason of REASONS) {
      const d = decision({ reason, detail: 'нет окна' })
      const { explainKey, explainArgs } = gateExplain(d)
      expect(gateSentence(d)).toBe(CATALOGUE_RESOLVE(explainKey, explainArgs))
    }
  })
})
