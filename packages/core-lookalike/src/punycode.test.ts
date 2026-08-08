import { describe, expect, it } from 'vitest'

import { decodePunycode, toUnicodeHost } from './punycode.js'

/**
 * The punycode decoder, tested where it lives.
 *
 * It was reached only through `checkLookalike`, which asks whether two names
 * resemble each other — a question that hides what the decoder returned. Its
 * bounds check once accepted `!` as a digit because only the upper bound was
 * tested, and that was found by reading rather than by a test.
 */

describe('decoding a punycode label', () => {
  it('decodes the canonical example', () => {
    expect(decodePunycode('mnchen-3ya')).toBe('münchen')
  })

  it('refuses punctuation offered as a digit', () => {
    // `digitOf` checked `code - 48 < 10` and not `>= 0`, so `!` read as 11.
    expect(decodePunycode('!!!not-punycode!!!')).toBeNull()
    expect(decodePunycode('a-0')).toBeNull()
  })

  it('refuses a delimiter with nothing after it', () => {
    expect(decodePunycode('-')).toBeNull()
  })

  it('gives back an empty string for empty input rather than throwing', () => {
    expect(decodePunycode('')).toBe('')
  })

  it('refuses a value that would overflow rather than wrapping', () => {
    expect(decodePunycode('99999999999999999999')).toBeNull()
  })
})

describe('decoding a whole host', () => {
  it('decodes the labels that are punycode and leaves the rest alone', () => {
    expect(toUnicodeHost('xn--mnchen-3ya.de')).toBe('münchen.de')
    expect(toUnicodeHost('example.com')).toBe('example.com')
  })

  it('keeps a label it cannot decode exactly as it found it', () => {
    // Returning something shorter would make two different hosts compare
    // equal, which in a lookalike check is a false negative on the real one.
    expect(toUnicodeHost('xn--0.de')).toBe('xn--0.de')
  })

  it('does not lose a label to a prefix with nothing behind it', () => {
    // `xn--.de` used to come back as `.de`: a label vanished, and a host that
    // is not `.de` compared as though it were.
    expect(toUnicodeHost('xn--.de')).toBe('xn--.de')
  })

  it('passes through a host that is only separators', () => {
    expect(toUnicodeHost('..')).toBe('..')
  })
})
