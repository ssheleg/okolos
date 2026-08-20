import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ALL_VIEWS,
  hashFor,
  KNOWN_HASHES,
  loadingRows,
  optionsPageFor,
  recoveryHref,
  routeFor,
  VIEW_FOR_HASH,
} from './views.js'

import { fromCatalogue, useResolver, type Catalogue } from '@okolos/i18n'

/** The shipped Russian catalogue: a fake would let a missing key pass as a label. */
const CATALOGUE = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../../_locales/ru/messages.json'),
    'utf8',
  ),
) as Catalogue

useResolver(fromCatalogue(CATALOGUE))

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

describe('the address is decoded once, and here', () => {
  /**
   * One decode, one owner.
   *
   * `routeFor` decodes and deliberately keeps a broken escape raw, so the checklist
   * can report an unknown kind instead of the page dying. `recoverySection` then
   * decoded a **second** time: `#recovery=%E0%A4%A` threw `URIError`,
   * `root.replaceChildren` was never reached, and the options page was completely
   * blank with an unhandled rejection in the console. Measured 2026-08-20.
   *
   * The quiet half of a double decode is worse than the loud one: on a value that
   * decodes cleanly it answers about a string the address never named. `%2520`
   * becomes `%20` and then a space.
   */
  it('hands out a value nobody needs to decode again', () => {
    const route = routeFor('#recovery=ran%20a%20command')
    expect(route).toEqual({ view: 'recovery', kind: 'ran a command' })
    // Decoding this again would be a no-op here and a lie on `%2520`, which is why
    // the rule is "once", not "until it stops changing".
    expect(routeFor('#recovery=a%2520b')).toEqual({ view: 'recovery', kind: 'a%20b' })
  })

  it('keeps a broken escape rather than throwing, and says nothing about it', () => {
    // The raw value is what the link actually said. The checklist reports it as an
    // unknown kind; nothing here is allowed to throw over it.
    expect(() => routeFor('#recovery=%E0%A4%A')).not.toThrow()
    expect(routeFor('#recovery=%E0%A4%A')).toEqual({ view: 'recovery', kind: '%E0%A4%A' })
  })

  it('is the only place in the options entry that decodes', () => {
    /**
     * Read from the file, because this is a rule about where a call may live and a
     * unit test cannot observe the absence of one. The entry point renders; the
     * routing module owns the address. A second decode anywhere downstream re-creates
     * exactly the blank page above.
     */
    const entry = readFileSync(
      path.join(import.meta.dirname, 'index.ts'),
      'utf8',
    )
      .split('\n')
      // Its own explanation names the call; a comment is not a call.
      .filter((line) => !/^\s*(\*|\/\/)/.test(line.trim()) && !line.trim().startsWith('*'))
      .join('\n')
    expect(entry).not.toContain('decodeURIComponent')
  })
})

describe('where the recovery row in the areas list goes', () => {
  it('opens the one open checklist, when there is exactly one', () => {
    // The defect: the row was handed the overview's address outright, so a row reading
    // "Восстановление" landed on the overview — a promise the click breaks (B-59).
    expect(recoveryHref([{ kind: 'pasted-command' }])).toBe('options.html#recovery=pasted-command')
  })

  it('opens the overview when nothing is open, because there is nothing to open', () => {
    // `#recovery` alone names no incident and `routeFor` calls it unrecognised, so
    // linking there would send the user through a redirect to the same place anyway.
    expect(recoveryHref([])).toBe('options.html')
  })

  it('opens the overview when several are open, because no one of them is the one', () => {
    // The attention band lists them all. Picking the first would be an answer nobody
    // asked for, and picking none is what the band is for.
    expect(recoveryHref([{ kind: 'pasted-command' }, { kind: 'credentials' }])).toBe(
      'options.html',
    )
  })

  it('escapes a kind that needs it, like every other address here', () => {
    // The same rule `hashFor` follows: a kind travels percent-encoded, because it comes
    // from a stored key and `#recovery=a b` is not one address.
    expect(recoveryHref([{ kind: 'not sure' }])).toBe('options.html#recovery=not%20sure')
  })
})

describe('the shell the overview paints before it has read anything', () => {
  it('carries every area, so no row appears late', () => {
    /**
     * `screens.md` promises SCR-15 paints its shell and all eight rows at once, and
     * `overview.ts` has had the `loading` state ready the whole time. The page never
     * built it: `renderRoute` awaited the storage check and then the whole section
     * before touching the DOM, so the first thing a person saw was a blank page for the
     * length of eight database reads (B-59).
     */
    const rows = loadingRows()
    expect(rows.map((row) => row.id).sort()).toEqual(
      ALL_VIEWS.filter((view) => view !== 'overview')
        .slice()
        .sort(),
    )
  })

  it('says "counting", never "could not be read"', () => {
    /**
     * The single most important branch on this screen: `null` means the product looked
     * and could not read it, and renders as that. Using it before a read has been
     * attempted would report a failure that has not happened — absence of data reading
     * as a verdict, one level down from the one this screen exists to prevent.
     */
    const unread = CATALOGUE['overviewStateUnread']?.message
    for (const row of loadingRows()) {
      expect(row.state, `${row.id} has no state in the shell`).not.toBeNull()
      expect(row.state).toBe(CATALOGUE['areaStateCounting']?.message)
      expect(row.state).not.toBe(unread)
    }
  })

  it('gives every row a real address, and the recovery row the honest one', () => {
    // A shell with dead links is a shell that has to be waited out. Recovery is the one
    // whose address depends on a read, so before any read it goes where `recoveryHref`
    // sends a page that cannot tell: the overview.
    for (const row of loadingRows()) {
      expect(row.href, `${row.id} has no address`).toMatch(/^options\.html/)
    }
    expect(loadingRows().find((row) => row.id === 'recovery')?.href).toBe('options.html')
  })

  it('labels every row from the catalogue, with nothing left unresolved', () => {
    for (const row of loadingRows()) {
      expect(row.label, `${row.id} has no label`).toBeTruthy()
      expect(row.label).not.toMatch(/^\[/)
    }
  })
})

describe('the shell is painted before anything is read', () => {
  it('has no await between renderRoute opening and the first paint', () => {
    /**
     * The property the shell exists for, and the only one a unit test cannot reach:
     * `options/index.ts` builds the whole settings surface at import, so `renderRoute`
     * cannot be called from here. What can be checked is the shape — a paint that sits
     * after an `await` is a paint that waits on data, which is the defect exactly.
     *
     * Read as source deliberately and narrowly: the slice between the function opening
     * and its first `replaceChildren`, asserted to contain no `await`. Not a search for
     * a phrase somewhere in the file, which is the kind of source assertion that agrees
     * with anything.
     */
    const source = readFileSync(
      path.resolve(import.meta.dirname, './index.ts'),
      'utf8',
    )
    const start = source.indexOf('async function renderRoute(')
    expect(start, 'renderRoute was renamed — this check now proves nothing').toBeGreaterThan(0)
    const firstPaint = source.indexOf('replaceChildren', start)
    expect(firstPaint, 'renderRoute paints nothing').toBeGreaterThan(start)

    const before = source.slice(start, firstPaint)
    expect(before, 'renderRoute awaits something before its first paint').not.toContain('await ')
  })
})
