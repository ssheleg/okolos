import { describe, expect, it } from 'vitest'

import { checkLookalike, editDistance } from './check.js'
import { decodePunycode, toUnicodeHost } from './punycode.js'
import { mixesScripts, skeleton } from './confusables.js'

const WATCHLIST = ['paypal.com', 'google.com', 'microsoft.com', 'bank.test', 'sbb.ch']

describe('decoding what the address bar hides', () => {
  it('turns punycode back into the letters it stands for', () => {
    // xn--pypal-4ve.com is "pаypal.com" with a Cyrillic а.
    expect(toUnicodeHost('xn--pypal-4ve.com')).toBe('pаypal.com')
  })

  it('leaves an ordinary label alone', () => {
    expect(toUnicodeHost('paypal.com')).toBe('paypal.com')
  })

  it('decodes a well-known example correctly', () => {
    expect(decodePunycode('mnchen-3ya')).toBe('münchen')
  })

  it('refuses input that is not punycode rather than guessing', () => {
    expect(decodePunycode('!!!not-punycode!!!')).toBeNull()
  })

  it('keeps a label it cannot decode instead of dropping it', () => {
    expect(toUnicodeHost('xn--!!!.com')).toBe('xn--!!!.com')
  })
})

describe('reducing a name to what it looks like', () => {
  it('collapses Cyrillic look-alikes onto their Latin twins', () => {
    expect(skeleton('pаypаl')).toBe(skeleton('paypal'))
  })

  it('collapses rn onto m, which is what makes rnicrosoft work', () => {
    expect(skeleton('rnicrosoft')).toBe(skeleton('microsoft'))
  })

  it('collapses a zero onto an o', () => {
    expect(skeleton('g00gle')).toBe(skeleton('google'))
  })

  it('notices a label built from two alphabets', () => {
    expect(mixesScripts('pаypal')).toBe(true)
    expect(mixesScripts('paypal')).toBe(false)
  })
})

describe('the genuine article is never flagged', () => {
  it('says nothing about the watched host itself', () => {
    expect(checkLookalike('paypal.com', WATCHLIST)).toBeNull()
  })

  it('says nothing about a subdomain of it', () => {
    // A warning on accounts.google.com teaches the user to dismiss the next
    // one without reading it.
    expect(checkLookalike('accounts.google.com', WATCHLIST)).toBeNull()
  })

  it('says nothing about an unrelated site', () => {
    expect(checkLookalike('example.test', WATCHLIST)).toBeNull()
  })

  it('says nothing about a short name one edit away', () => {
    // `sbb.ch` vs `sb.ch` is one edit, but so is a third of the word.
    expect(checkLookalike('sb.ch', WATCHLIST)).toBeNull()
  })
})

describe('what it does catch', () => {
  it('a homograph written in another alphabet', () => {
    const verdict = checkLookalike('xn--pypal-4ve.com', WATCHLIST)
    expect(verdict).toMatchObject({ kind: 'mixed-script', resembles: 'paypal.com' })
  })

  it('and shows both spellings, which is the only useful thing to show', () => {
    const verdict = checkLookalike('xn--pypal-4ve.com', WATCHLIST)
    expect(verdict?.visited).toBe('xn--pypal-4ve.com')
    expect(verdict?.decoded).toContain('а')
  })

  it('a digit standing in for a letter', () => {
    expect(checkLookalike('g00gle.com', WATCHLIST)).toMatchObject({
      kind: 'homograph',
      resembles: 'google.com',
    })
  })

  it('rn for m', () => {
    expect(checkLookalike('rnicrosoft.com', WATCHLIST)).toMatchObject({ resembles: 'microsoft.com' })
  })

  it('a single typed mistake', () => {
    expect(checkLookalike('payp4l.com', WATCHLIST)).toMatchObject({ kind: 'typo', distance: 1 })
  })

  it('a swapped pair of letters', () => {
    expect(checkLookalike('gogole.com', WATCHLIST)).toMatchObject({ resembles: 'google.com' })
  })

  it('the same name under a different ending', () => {
    expect(checkLookalike('paypal.security', WATCHLIST)).toMatchObject({
      kind: 'tld-swap',
      resembles: 'paypal.com',
    })
  })

  it('a lookalike used as a subdomain of something else', () => {
    expect(checkLookalike('login.g00gle.com', WATCHLIST)).not.toBeNull()
  })
})

describe('edit distance', () => {
  it('counts a swap as one mistake, because that is what it is', () => {
    expect(editDistance('gogole', 'google')).toBe(1)
  })

  it('counts an insertion and a deletion as one each', () => {
    expect(editDistance('gooogle', 'google')).toBe(1)
    expect(editDistance('gogle', 'google')).toBe(1)
  })

  it('is zero for the same string', () => {
    expect(editDistance('paypal', 'paypal')).toBe(0)
  })
})

describe('when there is nothing to compare against', () => {
  it('says nothing on an empty watchlist', () => {
    expect(checkLookalike('g00gle.com', [])).toBeNull()
  })

  it('ignores blank entries in the watchlist', () => {
    expect(checkLookalike('g00gle.com', ['', '  ', 'google.com'])).not.toBeNull()
  })

  it('has nothing to say about an empty host', () => {
    expect(checkLookalike('   ', WATCHLIST)).toBeNull()
  })
})
