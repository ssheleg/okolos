import { describe, expect, it } from 'vitest'

import { shortDate, shortTime } from './when.js'

describe('how a stored instant reaches a person', () => {
  it('gives the day when the hour is noise', () => {
    expect(shortDate('2026-08-20T23:23:22.936Z')).toBe('2026-08-20')
  })

  it('gives an unambiguous instant when the fact is a moment', () => {
    expect(shortTime('2026-08-20T23:23:22.936Z')).toBe('2026-08-20 23:23:22 UTC')
  })

  /**
   * Neither may hand a raw stored value to a sentence. This is the defect the module
   * exists for: `options/index.ts` passed one through and the dashboard showed
   * `2026-08-20T23:23:22.936Z` to a person.
   */
  it('never leaves the machine form in what it returns', () => {
    for (const rendered of [shortDate('2026-08-20T23:23:22.936Z'), shortTime('2026-08-20T23:23:22.936Z')]) {
      expect(rendered).not.toContain('T2')
      expect(rendered).not.toMatch(/\.\d+Z/)
    }
  })

  it('passes through something that is already a day', () => {
    // The storage layer keeps some values as ten characters already.
    expect(shortDate('2026-08-20')).toBe('2026-08-20')
    expect(shortTime('2026-08-20')).toBe('2026-08-20')
  })
})
