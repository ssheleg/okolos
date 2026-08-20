/**
 * Which address opens which area.
 *
 * This page used to be one stack of eight panels, and "navigation" was a scroll
 * position. Two mechanisms did that job and neither knew about the other:
 * `SECTION_FOR_HASH` scrolled `#queue` into view, and `#recovery=<kind>` was
 * parsed inside the recovery section itself and decided whether that section
 * existed at all. Everything else fell through to the top of the document.
 *
 * The cost was not theoretical. The popup produced `options.html#journal` from
 * two call sites and nothing consumed it, so "что изменилось" opened a page
 * four sections above the journal; and `onOpen('settings')` fell into the
 * `else` branch and opened the self-audit panel, so the settings link did not
 * go to settings.
 *
 * One table now, read by one function, and a gate asserts that every address
 * the extension *produces* is one this table *resolves* — because the defect
 * above was never a bug in either half. It was that the two halves were never
 * compared.
 */

/** The areas of the page. `overview` is the page with no area chosen. */
export type ViewId =
  | 'overview'
  | 'queue'
  | 'journal'
  | 'leaks'
  | 'extensions'
  | 'trusted'
  | 'recovery'
  | 'audit'
  | 'data'

export interface Route {
  readonly view: ViewId
  /**
   * The incident kind for `#recovery=<kind>`, already percent-decoded.
   * Absent for every other view.
   */
  readonly kind?: string
  /**
   * The address that was not understood, when there was one.
   *
   * The view is still `overview` — an unrecognised address must land
   * somewhere — but the overview says which address it did not understand.
   * Falling back in silence is exactly how `#journal` went nowhere for a
   * release without a single test noticing.
   */
  readonly unrecognised?: string
}

/**
 * Address → area. The keys are the whole vocabulary: an address that is not a
 * key here does not exist, and saying so is this table's second job.
 */
export const VIEW_FOR_HASH: Readonly<Record<string, Exclude<ViewId, 'recovery'>>> = {
  '#queue': 'queue',
  '#journal': 'journal',
  '#leaks': 'leaks',
  '#extensions': 'extensions',
  '#trusted': 'trusted',
  '#audit': 'audit',
  '#data': 'data',
}

/** `#recovery=<kind>`, the one address that carries a value. */
const RECOVERY = /^#recovery=(.*)$/

/**
 * The area an address opens.
 *
 * Accepts the raw `location.hash`, including the empty string a page with no
 * fragment has.
 */
export function routeFor(hash: string): Route {
  if (hash === '' || hash === '#') return { view: 'overview' }

  const known = VIEW_FOR_HASH[hash]
  if (known !== undefined) return { view: known }

  const recovery = RECOVERY.exec(hash)
  if (recovery) {
    const raw = recovery[1] ?? ''
    // An incident kind arrives percent-encoded and may be malformed; a broken
    // escape must not throw here and take the whole page down with it. The
    // checklist builder already answers an unknown kind with the broad list and
    // says so, which is the right place for that decision.
    let kind = raw
    try {
      kind = decodeURIComponent(raw)
    } catch {
      // Keep the raw value: it is what the link actually said, and the
      // checklist will report it as an unknown kind rather than pretend.
    }
    // `#recovery=` with nothing after it names no incident. That is an address
    // this product does not produce, so it is unrecognised rather than a
    // recovery view with an empty kind.
    if (kind === '') return { view: 'overview', unrecognised: hash }
    return { view: 'recovery', kind }
  }

  return { view: 'overview', unrecognised: hash }
}

/** Every address this table resolves, for the gate and for tests. */
export const KNOWN_HASHES: readonly string[] = Object.keys(VIEW_FOR_HASH)

/**
 * The address that opens an area — the producing half of the same table.
 *
 * Callers must not spell an address themselves. Both halves reading one table
 * is what makes the class of defect this module was written for impossible
 * rather than merely tested for: `routeFor(hashFor(v))` returns `v` for every
 * area, and a gate asserts exactly that round trip.
 */
export function hashFor(view: ViewId, kind?: string): string {
  if (view === 'overview') return ''
  if (view === 'recovery') {
    // A recovery address with no incident resolves to the overview, so
    // producing one would be producing a broken link.
    if (kind === undefined || kind === '') {
      throw new Error('hashFor("recovery") needs an incident kind')
    }
    return `#recovery=${encodeURIComponent(kind)}`
  }
  const entry = Object.entries(VIEW_FOR_HASH).find(([, id]) => id === view)
  // i18n-exempt: unreachable for any ViewId the table covers — a programming
  // mistake reported to whoever is holding the debugger, not to a user.
  if (entry === undefined) throw new Error(`no address for view ${view}`)
  return entry[0]
}

/** The extension-relative page URL that opens an area. */
export function optionsPageFor(view: ViewId, kind?: string): string {
  return `options.html${hashFor(view, kind)}`
}

/** Every area, for gates and for the overview's own list. */
export const ALL_VIEWS: readonly ViewId[] = [
  'overview',
  'queue',
  'journal',
  'leaks',
  'extensions',
  'trusted',
  'recovery',
  'audit',
  'data',
]
