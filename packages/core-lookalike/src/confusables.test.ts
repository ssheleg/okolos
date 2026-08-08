import { describe, expect, it } from 'vitest'

import { mixesScripts, skeleton } from './confusables.js'

/**
 * The skeleton and the script check, tested where they live.
 *
 * These decide whether two names look alike to a person, which is the whole
 * homograph verdict. They were reached only through `checkLookalike`, where a
 * wrong skeleton shows up as a missing warning rather than as a wrong answer.
 */

describe('the skeleton a person actually sees', () => {
  it('folds the Cyrillic letters that are drawn like Latin ones', () => {
    // "раypal" with Cyrillic а and р is the attack this exists to catch.
    expect(skeleton('раypal')).toBe(skeleton('paypal'))
  })

  it('folds digits that stand in for letters', () => {
    expect(skeleton('paypa1')).toBe(skeleton('paypal'))
    expect(skeleton('g00gle')).toBe(skeleton('google'))
  })

  it('does not fold names that merely rhyme', () => {
    // A skeleton that collapses too much turns every short name into every
    // other one, and the warning becomes noise.
    expect(skeleton('paypal')).not.toBe(skeleton('paypad'))
    expect(skeleton('sber')).not.toBe(skeleton('uber'))
  })

  it('is stable for the same input', () => {
    expect(skeleton('münchen')).toBe(skeleton('münchen'))
  })

  it('survives an empty label without throwing', () => {
    expect(() => skeleton('')).not.toThrow()
  })
})

describe('spotting a name written in two alphabets at once', () => {
  it('sees a Cyrillic letter hiding among Latin ones', () => {
    expect(mixesScripts('раypal')).toBe(true)
  })

  it('leaves a name written in one alphabet alone', () => {
    expect(mixesScripts('paypal')).toBe(false)
    // A wholly Cyrillic name is ordinary in the market this product serves and
    // must not be a signal on its own.
    expect(mixesScripts('сбербанк')).toBe(false)
  })

  it('does not count digits or hyphens as an alphabet', () => {
    expect(mixesScripts('paypal-2024')).toBe(false)
  })
})
