import { describe, expect, it } from 'vitest'

import { recordUse, reuseOf, type ReuseEntry } from './reuse.js'

/**
 * The distinction this module exists to keep: "seen nowhere else" and "never
 * seen at all" are different answers, and only one of them is reassuring.
 */

const entry = (tag: string, host: string, seenAt: string): ReuseEntry => ({ tag, host, seenAt })

const INDEX: readonly ReuseEntry[] = [
  entry('aaa', 'shop.test', '2026-03-01'),
  entry('aaa', 'forum.test', '2026-01-15'),
  entry('aaa', 'bank.test', '2026-05-20'),
  entry('bbb', 'mail.test', '2026-02-02'),
]

describe('what the index can say', () => {
  it('names the other sites, and never the one being asked about', () => {
    const { elsewhere } = reuseOf(INDEX, 'aaa', 'bank.test')
    expect(elsewhere.map((e) => e.host)).toEqual(['forum.test', 'shop.test'])
  })

  it('puts the oldest first, because that is the one they have forgotten', () => {
    const { elsewhere } = reuseOf(INDEX, 'aaa', 'bank.test')
    expect(elsewhere[0]?.seenAt).toBe('2026-01-15')
  })

  it('says nothing is elsewhere when the tag is on this host alone', () => {
    const { elsewhere, unknown } = reuseOf([entry('ccc', 'only.test', '2026-04-04')], 'ccc', 'only.test')
    expect(elsewhere).toEqual([])
    expect(unknown).toBe(false)
  })

  it('separates "not seen before" from "used nowhere else"', () => {
    // A fresh install answers the first and must never be read as the second.
    const { elsewhere, unknown } = reuseOf([], 'ddd', 'bank.test')
    expect(elsewhere).toEqual([])
    expect(unknown).toBe(true)
  })

  it('does not confuse two passwords that share a host', () => {
    const { elsewhere } = reuseOf(INDEX, 'bbb', 'bank.test')
    expect(elsewhere.map((e) => e.host)).toEqual(['mail.test'])
  })
})

describe('recording a use', () => {
  it('adds a host the tag has not been seen on', () => {
    const after = recordUse(INDEX, entry('aaa', 'news.test', '2026-08-09'))
    expect(after).toHaveLength(INDEX.length + 1)
    expect(reuseOf(after, 'aaa', 'bank.test').elsewhere.map((e) => e.host)).toContain('news.test')
  })

  it('keeps the first date rather than the latest', () => {
    // Overwriting it on every login would turn the index into a record of when
    // the user last visited a site, which is browsing history by another name.
    const after = recordUse(INDEX, entry('aaa', 'shop.test', '2026-08-09'))
    expect(after).toHaveLength(INDEX.length)
    expect(after.find((e) => e.tag === 'aaa' && e.host === 'shop.test')?.seenAt).toBe('2026-03-01')
  })

  it('leaves the index it was given untouched', () => {
    const before = INDEX.length
    recordUse(INDEX, entry('zzz', 'new.test', '2026-08-09'))
    expect(INDEX).toHaveLength(before)
  })
})
