import { describe, expect, it } from 'vitest'

import { displayFeedName, displayFeedNameEn, isOurFeed, OUR_FEEDS } from './display.js'

/** Stands in for the extension's catalogue lookup. */
const translate = (key: string): string => `«${key}»`

describe('naming a list', () => {
  it('gives our own list a name instead of its identifier', () => {
    expect(displayFeedName('phishing', translate)).toBe('«feedNamePhishing»')
    expect(displayFeedNameEn('phishing')).toBe('Okolos phishing list')
  })

  it('leaves a third-party list called what it calls itself', () => {
    // The terminology says these names are not translated. Inventing one would
    // be renaming somebody else's list.
    for (const other of ['OpenPhish', 'PhishTank', 'URLhaus', 'Hudson Rock']) {
      expect(displayFeedName(other, translate)).toBe(other)
      expect(displayFeedNameEn(other)).toBe(other)
    }
  })

  it('says nothing rather than something empty when there is no list', () => {
    for (const nothing of [null, undefined, '']) {
      expect(displayFeedName(nothing, translate)).toBeNull()
      expect(displayFeedNameEn(nothing)).toBeNull()
    }
  })

  it('knows which identifiers are ours to name', () => {
    expect(isOurFeed('phishing')).toBe(true)
    expect(isOurFeed('OpenPhish')).toBe(false)
    // Object.hasOwn, not `in`: `isOurFeed('toString')` must not be true.
    expect(isOurFeed('toString')).toBe(false)
    expect(isOurFeed('constructor')).toBe(false)
  })

  it('carries a key and an English name for every list it claims', () => {
    const entries = Object.entries(OUR_FEEDS)
    expect(entries.length).toBeGreaterThan(0)
    for (const [id, name] of entries) {
      expect(name.messageKey, `${id} has no catalogue key`).toMatch(/^feedName[A-Z]/)
      expect(name.en.length, `${id} has no English name`).toBeGreaterThan(3)
      expect(name.en, `${id} shows its own identifier as a name`).not.toBe(id)
    }
  })
})
