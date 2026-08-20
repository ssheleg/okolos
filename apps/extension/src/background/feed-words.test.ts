import { describe, expect, it } from 'vitest'
import type { Refusal } from '@okolos/core-feeds'

import { REFUSAL_KEY, feedAccepted, feedRefusal } from './feed-words.js'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fromCatalogue, useResolver, type Catalogue } from '@okolos/i18n'

/**
 * The words for a feed update, on the surface that owns them.
 *
 * `core-feeds` composed one English sentence per refusal reason, beside a code that said
 * the same thing (B-75). The sentence went into the journal, and `exportAll` puts the
 * journal into the file the user downloads — so these are asserted against the *shipped*
 * Russian catalogue. A feed that quietly stopped updating looks exactly like one with
 * nothing new to say, which is why the refusal has to be readable at all.
 */
const CATALOGUE = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../_locales/ru/messages.json'), 'utf8'),
) as Catalogue

useResolver(fromCatalogue(CATALOGUE))

const resolve = fromCatalogue(CATALOGUE)
const say = (explained: { explainKey: string; explainArgs: readonly string[] }): string =>
  resolve(explained.explainKey, explained.explainArgs)

const KEPT = { name: 'phishing', version: 7, updatedAt: '2026-08-01T00:00:00.000Z', entries: [] }

const REFUSALS: readonly Refusal[] = [
  { reason: 'bad-signature', feed: 'phishing' },
  { reason: 'bad-version', feed: 'phishing', found: 'NaN' },
  { reason: 'wrong-feed', feed: 'phishing', current: 'malware' },
  { reason: 'not-newer', version: 4, current: 7 },
  { reason: 'no-current', feed: 'phishing' },
  { reason: 'wrong-base', base: 3, current: 7 },
]

describe('every reason a feed update can be refused for', () => {
  it('has a key the shipped catalogue answers', () => {
    for (const refusal of REFUSALS) {
      const key = REFUSAL_KEY[refusal.reason]
      expect(key, `no key for ${refusal.reason}`).toBeTruthy()
      expect(CATALOGUE[key], `the shipped catalogue has no "${key}"`).toBeTruthy()
    }
  })

  it('gives each reason its own key and its own sentence', () => {
    // A key wired to another reason's message reads as a true sentence about the wrong
    // event: "not newer than the one in force" about an update signed by an impostor.
    const keys = Object.values(REFUSAL_KEY)
    expect(new Set(keys).size, keys.join(', ')).toBe(keys.length)
    const sentences = REFUSALS.map((refusal) => say(feedRefusal(refusal, KEPT)))
    expect(new Set(sentences).size).toBe(sentences.length)
  })

  it('resolves every one with no placeholder and no bare code left', () => {
    for (const refusal of REFUSALS) {
      const sentence = say(feedRefusal(refusal, KEPT))
      expect(sentence, refusal.reason).not.toMatch(/\$[A-Z]+\$/)
      expect(sentence, refusal.reason).not.toMatch(/^\[/)
      expect(sentence, refusal.reason).not.toContain(refusal.reason)
    }
  })

  it('names our own list the way a person is shown it, never by its identifier', () => {
    /**
     * `phishing` is a database key. The list has a name in the catalogue, and the worker
     * has had one since B-51 — `displayFeedNameEn` is for `apps/proxy`, which serves
     * public pages and cannot translate. Two sentences here were substituting the English
     * name into Russian prose because that function was documented "for the worker".
     */
    const sentence = say(feedRefusal({ reason: 'no-current', feed: 'phishing' }, null))
    expect(sentence).toContain(CATALOGUE['feedNamePhishing']?.message)
    expect(sentence).not.toContain('phishing')
    expect(sentence).not.toContain('Okolos phishing list')
  })

  it('leaves a list we do not publish under the name it already has', () => {
    // An identifier we do not publish is already somebody's name for their own list;
    // inventing a translation of it would be inventing a fact.
    const sentence = say(feedRefusal({ reason: 'no-current', feed: 'someone-elses-list' }, null))
    expect(sentence).toContain('someone-elses-list')
  })
})

describe('a signature that does not verify', () => {
  it('says what stays in force when something does', () => {
    const sentence = say(feedRefusal({ reason: 'bad-signature', feed: 'phishing' }, KEPT))
    expect(sentence).toContain('7')
  })

  it('says there is nothing to fall back to when there is not', () => {
    /**
     * The one reason with two messages, and the choice is made here rather than in the
     * package: with nothing kept there is no version to substitute, so a single sentence
     * would have to render "version  stays in force" — a claim about a version that does
     * not exist, on the one screen that has to be trusted about protection being off.
     */
    const sentence = say(feedRefusal({ reason: 'bad-signature', feed: 'phishing' }, null))
    expect(sentence).not.toMatch(/\$[A-Z]+\$/)
    expect(sentence).not.toMatch(/\s\s|\s\./)
    expect(sentence).not.toBe(say(feedRefusal({ reason: 'bad-signature', feed: 'phishing' }, KEPT)))
  })
})

describe('an update that landed', () => {
  it('is said in the same shape, so the journal reads one way', () => {
    const explained = feedAccepted('phishing', 9)
    expect(explained.explainKey).toBe('feedNowAtVersion')
    expect(explained.explainArgs).toEqual([CATALOGUE['feedNamePhishing']?.message, '9'])
    expect(say(explained)).toContain('9')
  })
})
