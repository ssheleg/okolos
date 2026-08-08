import { describe, expect, it } from 'vitest'

import { answered, NoAnswerError } from './answered.js'

describe('an answer that never came', () => {
  it('is a failure, not an empty result', () => {
    // `?? []` here is how "we could not ask" becomes "you trust nothing" —
    // reassuring, and possibly the opposite of true.
    expect(() => answered(null, 'the trusted list')).toThrow(NoAnswerError)
    expect(() => answered(undefined, 'the trusted list')).toThrow(NoAnswerError)
  })

  it('names what was being asked, so the message means something', () => {
    expect(() => answered(null, 'the trusted list')).toThrow(/trusted list/)
  })

  it('passes a real answer straight through, including an empty one', () => {
    // An empty list that the background actually sent is a fact and must not
    // be confused with silence.
    const empty = { entries: [] }
    expect(answered(empty, 'the trusted list')).toBe(empty)
    expect(answered({ entries: [{ domain: 'x.test' }] }, 'x')).toEqual({
      entries: [{ domain: 'x.test' }],
    })
  })

  it('does not treat a falsy-but-real answer as missing', () => {
    expect(answered(0, 'a count')).toBe(0)
    expect(answered(false, 'a flag')).toBe(false)
    expect(answered('', 'a string')).toBe('')
  })
})
