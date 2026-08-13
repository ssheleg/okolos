import { describe, expect, it } from 'vitest'

import { ALL_VIEWS, hashFor, KNOWN_HASHES, optionsPageFor, routeFor, VIEW_FOR_HASH } from './views.js'

describe('the address decides the area', () => {
  it('opens the overview when there is no address', () => {
    expect(routeFor('')).toEqual({ view: 'overview' })
    expect(routeFor('#')).toEqual({ view: 'overview' })
  })

  for (const [hash, view] of Object.entries(VIEW_FOR_HASH)) {
    it(`${hash} opens ${view}`, () => {
      expect(routeFor(hash)).toEqual({ view })
    })
  }

  it('carries the incident kind out of a recovery address', () => {
    expect(routeFor('#recovery=entered-password')).toEqual({
      view: 'recovery',
      kind: 'entered-password',
    })
  })

  it('decodes an incident kind that was encoded into the link', () => {
    expect(routeFor('#recovery=ran%20a%20command')).toEqual({
      view: 'recovery',
      kind: 'ran a command',
    })
  })

  it('keeps a malformed escape rather than throwing the page away', () => {
    // A broken percent-escape must not take the page down: the checklist
    // answers an unknown kind with the broad list and says so.
    expect(routeFor('#recovery=%E0%A4%A')).toEqual({
      view: 'recovery',
      kind: '%E0%A4%A',
    })
  })
})

describe('an address nobody understands says so', () => {
  it('lands on the overview and names what it did not understand', () => {
    expect(routeFor('#nowhere')).toEqual({ view: 'overview', unrecognised: '#nowhere' })
  })

  it('treats a recovery address with no incident as unrecognised', () => {
    // `#recovery=` names no incident. Opening the recovery view on it would
    // show a checklist for nothing.
    expect(routeFor('#recovery=')).toEqual({ view: 'overview', unrecognised: '#recovery=' })
  })

  it('never leaves the view unset — an unrecognised address still lands somewhere', () => {
    for (const hash of ['#queue2', '#JOURNAL', '#leaks/1', '#a=b', '##']) {
      const route = routeFor(hash)
      expect(route.view, hash).toBe('overview')
      expect(route.unrecognised, hash).toBe(hash)
    }
  })

  it('is case-sensitive on purpose, and says so rather than guessing', () => {
    // Guessing `#Journal` means `#journal` and `#JOURNAL` differ from each
    // other by luck. The addresses this product produces are lower-case; one
    // that is not is a defect worth seeing.
    expect(routeFor('#Journal').unrecognised).toBe('#Journal')
  })
})

describe('the vocabulary is complete and has no duplicates', () => {
  it('lists every address the table resolves', () => {
    expect([...KNOWN_HASHES].sort()).toEqual(
      ['#audit', '#data', '#extensions', '#journal', '#leaks', '#queue', '#trusted'].sort(),
    )
  })

  it('maps no two addresses onto one area', () => {
    const views = Object.values(VIEW_FOR_HASH)
    expect(new Set(views).size).toBe(views.length)
  })

  it('every address starts with # so a raw location.hash matches it', () => {
    for (const hash of KNOWN_HASHES) expect(hash.startsWith('#')).toBe(true)
  })
})

describe('the producing half and the reading half are one table', () => {
  it('every area round-trips through its own address', () => {
    for (const view of ALL_VIEWS) {
      const hash = view === 'recovery' ? hashFor(view, 'entered-password') : hashFor(view)
      expect(routeFor(hash).view, view).toBe(view)
    }
  })

  it('covers every area — a new one cannot be forgotten here', () => {
    // ALL_VIEWS is what the overview lists and what the gate walks. A view
    // added to the type but not to this list would be invisible to both.
    expect(new Set(ALL_VIEWS).size).toBe(ALL_VIEWS.length)
    expect(ALL_VIEWS).toContain('overview')
    expect(ALL_VIEWS.length).toBe(KNOWN_HASHES.length + 2) // + overview + recovery
  })

  it('refuses to produce a recovery address with no incident', () => {
    // Producing one would produce a link that resolves to the overview: a
    // broken link, minted by the helper that exists to prevent them.
    expect(() => hashFor('recovery')).toThrow(/incident kind/)
    expect(() => hashFor('recovery', '')).toThrow(/incident kind/)
  })

  it('encodes an incident kind that needs it, and reads it back whole', () => {
    const hash = hashFor('recovery', 'ran a command')
    expect(hash).toBe('#recovery=ran%20a%20command')
    expect(routeFor(hash)).toEqual({ view: 'recovery', kind: 'ran a command' })
  })

  it('builds the page URL the popup and the banners open', () => {
    expect(optionsPageFor('journal')).toBe('options.html#journal')
    expect(optionsPageFor('overview')).toBe('options.html')
    expect(optionsPageFor('recovery', 'entered-password')).toBe(
      'options.html#recovery=entered-password',
    )
  })
})
