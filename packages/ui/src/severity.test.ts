import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { SEVERITY_WORD_KEY } from './severity.js'

/** The shipped Russian catalogue: `default_locale` is `ru`, and a fake would let a missing key pass. */
const CATALOGUE = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../../../apps/extension/_locales/ru/messages.json'),
    'utf8',
  ),
) as Record<string, { message: string }>

describe('the words for a severity', () => {
  it('covers every level the contract has', () => {
    // The type already forces this; asserted anyway because the failure it prevents is a
    // level rendering as an empty span on three screens at once.
    expect(Object.keys(SEVERITY_WORD_KEY).sort()).toEqual(['critical', 'info', 'major', 'minor'])
  })

  it('names keys the shipped catalogue actually has', () => {
    const missing = Object.values(SEVERITY_WORD_KEY).filter((key) => !CATALOGUE[key])
    expect(missing, 'a severity would render as its own key').toEqual([])
  })

  it('gives each level its own word, so two levels cannot read alike', () => {
    const words = Object.values(SEVERITY_WORD_KEY).map((key) => CATALOGUE[key]?.message)
    expect(new Set(words).size).toBe(words.length)
  })
})
