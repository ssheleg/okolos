import { describe, expect, it } from 'vitest'
import type { InventoryChange, PackageReport } from '@okolos/core-extensions'

import {
  ANALYSIS_NOTE_KEY,
  CHANGE_EXPLAIN_KEY,
  analysisNote,
  changeExplain,
  changeSentence,
  findingEvidence,
} from './words.js'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fromCatalogue, useResolver, type Catalogue } from '@okolos/i18n'

/**
 * The words for what `core-extensions` reports, on the surface that owns them.
 *
 * The package used to compose them: a sentence per change, two caveats, and a hex
 * density with the number already inside an English phrase (B-75). Asserted here
 * against the *shipped* Russian catalogue, because a fake would let a missing key pass
 * and `[extensionsChangeHosts]` on the panel is the defect this move exists to prevent.
 */
const CATALOGUE = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../../../apps/extension/_locales/ru/messages.json'), 'utf8'),
) as Catalogue

useResolver(fromCatalogue(CATALOGUE))

const KINDS: readonly InventoryChange['kind'][] = [
  'newly-installed',
  'removed',
  'publisher-changed',
  'permission-added',
  'host-access-widened',
]

function change(kind: InventoryChange['kind']): InventoryChange {
  const base = { id: 'abc', name: 'Считыватель страниц' }
  switch (kind) {
    case 'publisher-changed':
      return { ...base, kind, severity: 'critical', publisher: 'Кто-то Ещё', previousPublisher: 'Кто-то' }
    case 'permission-added':
      return { ...base, kind, severity: 'critical', permissions: ['cookies', 'debugger'] }
    case 'host-access-widened':
      return { ...base, kind, severity: 'critical', hosts: ['*://*/*'] }
    default:
      return { ...base, kind: kind as 'removed', severity: 'minor' }
  }
}

describe('every kind of change a person can be shown', () => {
  it('has a key the shipped catalogue answers', () => {
    for (const kind of KINDS) {
      const key = CHANGE_EXPLAIN_KEY[kind]
      expect(key, `no key for ${kind}`).toBeTruthy()
      expect(CATALOGUE[key], `the shipped catalogue has no "${key}"`).toBeTruthy()
    }
  })

  it('gives each kind its own key and its own sentence', () => {
    // A key wired to another kind's message reads as a true sentence about the wrong
    // event — "больше не установлено" about an extension that had just been added.
    const keys = Object.values(CHANGE_EXPLAIN_KEY)
    expect(new Set(keys).size, keys.join(', ')).toBe(keys.length)
    const sentences = KINDS.map((kind) => changeSentence(change(kind)))
    expect(new Set(sentences).size).toBe(sentences.length)
  })

  it('leaves no placeholder and no bare code in what it renders', () => {
    for (const kind of KINDS) {
      const sentence = changeSentence(change(kind))
      expect(sentence, kind).not.toMatch(/\$[A-Z]+\$/)
      expect(sentence, kind).not.toMatch(/^\[/)
      expect(sentence, kind).toContain('Считыватель страниц')
      expect(sentence, kind).not.toContain(kind)
    }
  })

  it('stores a key and its arguments, not the sentence they make', () => {
    /**
     * The worker journals a change so it survives the page, and `summarise` in the
     * popup resolves `explainKey` at read time. A sentence stored instead would freeze
     * the language: switch the browser next month and every unaccepted row stays in the
     * old one — and the journal's own dedup, which compares these values, would rewrite
     * every row and push `createdAt` to today, each old change claiming it just happened.
     */
    expect(changeExplain(change('permission-added'))).toEqual({
      explainKey: 'extensionsChangePermission',
      explainArgs: ['Считыватель страниц', 'cookies, debugger'],
    })
  })
})

describe('what each sentence is allowed to say', () => {
  it('names both parties when the publisher changed', () => {
    // One party alone cannot be checked against anything: "now published by X" is only
    // a change if the reader is told what X replaced.
    const sentence = changeSentence(change('publisher-changed'))
    expect(sentence).toContain('Кто-то Ещё')
    expect(sentence).toContain('Кто-то')
  })

  it('words an unnamed publisher rather than printing nothing', () => {
    // `null` is a fact about the store's listing; the words for it are the reader's.
    const sentence = changeSentence({
      id: 'abc',
      name: 'Считыватель страниц',
      kind: 'publisher-changed',
      severity: 'critical',
      publisher: null,
      previousPublisher: 'Кто-то',
    })
    expect(sentence).toContain(CATALOGUE['extensionsUnnamedParty']?.message ?? '—')
    expect(sentence).not.toContain('null')
  })

  it('keeps permission and host names exactly as the manifest writes them', () => {
    // A person checking the extension's own listing has to find the same words there.
    expect(changeSentence(change('permission-added'))).toContain('cookies, debugger')
    expect(changeSentence(change('host-access-widened'))).toContain('*://*/*')
  })
})

describe('the caveat under an analysis', () => {
  const report = (minified: boolean): PackageReport => ({ findings: [], endpoints: [], minified })

  it('turns on nothing but whether the file is minified', () => {
    expect(analysisNote(report(true))).toBe(CATALOGUE[ANALYSIS_NOTE_KEY.minified]?.message)
    expect(analysisNote(report(false))).toBe(CATALOGUE[ANALYSIS_NOTE_KEY.readable]?.message)
  })

  it('says different things in the two cases', () => {
    // Both sentences are about what reading proves; a minified file proves less, and a
    // panel that said the same thing either way would be telling the reader nothing.
    expect(analysisNote(report(true))).not.toBe(analysisNote(report(false)))
  })
})

describe('the evidence beside a finding', () => {
  it('quotes the file verbatim for the kinds that have an excerpt', () => {
    const evidence = findingEvidence({ kind: 'remote-code', evidence: 'importScripts("x")', where: 'bg.js' })
    expect(evidence).toBe('importScripts("x")')
  })

  it('puts a sentence around a measurement, which has no excerpt to quote', () => {
    const evidence = findingEvidence({ kind: 'hex-density', per100: 7, where: 'bg.js' })
    expect(evidence).toContain('7')
    expect(evidence).not.toMatch(/\$[A-Z]+\$/)
    // A bare "7" on the panel is a number nobody can act on.
    expect(evidence.length).toBeGreaterThan(10)
  })
})
