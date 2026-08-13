/**
 * The page you land on, and the question it answers before you open anything.
 *
 * The extension's own page used to be eight panels in one stack, in a fixed
 * order, all of them rendered every time. "What needs me right now" was a
 * question you answered by scrolling: the queue caps itself at three, the
 * journal shows a diff, the extensions panel shows changes — and nothing ranked
 * across them. So the ranking lives here, once, over the same ranker the queue
 * already uses. Two rankers would be two definitions of "worst".
 *
 * **The band caps at three and counts the rest**, exactly like the queue,
 * because this product exists because of the other thing — 203 alerts presented
 * as progress. A band that lists everything is that wall with a new name.
 *
 * **A row whose state could not be read says so.** Eight cheap reads sit behind
 * this screen and any of them can fail; rendering a failure as "пусто" would
 * turn eight separate chances to lie into one reassuring word. That is the
 * oldest rule in this codebase — absence of data must never read as a pass —
 * and this surface multiplies its stakes by eight.
 */

import type { Severity } from '@okolos/contracts'
import { t } from '@okolos/i18n'

/** The areas of the page. Mirrors `ViewId` in the extension, minus `overview`. */
export type AreaId =
  | 'queue'
  | 'journal'
  | 'leaks'
  | 'extensions'
  | 'trusted'
  | 'recovery'
  | 'audit'
  | 'data'

export interface AttentionItem {
  readonly severity: Severity
  /** What happened, in the user's words. */
  readonly what: string
  /** Where it came from — a host, a package name — or null when it has no place. */
  readonly where: string | null
  /** When, already phrased. */
  readonly when: string
  /** The area that owns it, and where its row leads. */
  readonly area: AreaId
  readonly href: string
}

export interface AreaRow {
  readonly id: AreaId
  readonly label: string
  readonly href: string
  /**
   * The one-line state, already phrased — or `null` when the count could not
   * be read. `null` is not "empty" and must never render as it.
   */
  readonly state: string | null
}

export type OverviewState =
  | { readonly kind: 'loading'; readonly areas: readonly AreaRow[] }
  | { readonly kind: 'error'; readonly message: string; readonly areas: readonly AreaRow[] }
  | {
      readonly kind: 'ready'
      readonly attention: readonly AttentionItem[]
      readonly areas: readonly AreaRow[]
      /** When the product last looked. Shown when the band is empty. */
      readonly lastChecked: string | null
      /** The address that was not understood, when the user arrived by one. */
      readonly unrecognised?: string
    }

export interface OverviewHandlers {
  readonly onOpen: (area: AreaId) => void
  readonly onRepair: () => void
}

/** The band never shows more than this, whatever it was handed. */
export const ATTENTION_SHOWN = 3

/**
 * Severity as a word, never as a colour alone.
 *
 * The mark and the word are one unit: a reader who cannot tell the colours
 * apart, and a reader who is looking at a screenshot in a bug report, both get
 * the same information.
 */
const SEVERITY_MARK: Readonly<Record<Severity, string>> = {
  critical: '▲',
  major: '▲',
  minor: '■',
  info: '●',
}

/**
 * The words are the product's existing ones, not new ones.
 *
 * A first draft of this band invented `high`/`medium`/`low` and three keys to
 * go with them — a second vocabulary for severity, introduced by the very pass
 * whose job was to stop one action having two names. `Severity` is
 * `critical | major | minor | info` everywhere else in this codebase and the
 * banner already says those words aloud.
 */
const SEVERITY_WORD: Readonly<Record<Severity, string>> = {
  critical: 'bannerSeverityCritical',
  major: 'bannerSeverityMajor',
  minor: 'bannerSeverityMinor',
  info: 'bannerSeverityInfo',
}

export function renderOverview(
  doc: Document,
  state: OverviewState,
  handlers: OverviewHandlers,
): HTMLElement {
  const root = doc.createElement('section')
  root.setAttribute('data-role', 'overview')

  const heading = doc.createElement('h1')
  heading.setAttribute('data-role', 'overview-heading')
  heading.textContent = t('overviewTitle')
  root.append(heading)

  if (state.kind === 'ready' && state.unrecognised !== undefined) {
    // The address the user arrived by meant nothing. Saying so is the whole
    // point: a silent fallback to this page is indistinguishable from the link
    // having worked, which is how a dead link survived a release.
    root.append(line(doc, 'overview-unrecognised', t('overviewUnrecognised', state.unrecognised)))
  }

  root.append(band(doc, state, handlers))
  root.append(areaList(doc, state.areas, handlers))
  return root
}

function band(doc: Document, state: OverviewState, handlers: OverviewHandlers): HTMLElement {
  const section = doc.createElement('section')
  section.setAttribute('data-role', 'attention')

  if (state.kind === 'loading') {
    section.append(line(doc, 'attention-counting', t('overviewCounting')))
    return section
  }

  if (state.kind === 'error') {
    // Not an empty band: this page could not look, and it says so rather than
    // reporting the silence as calm.
    section.append(line(doc, 'attention-error', t('overviewUnread', state.message)))
    const repair = doc.createElement('button')
    repair.setAttribute('data-role', 'overview-repair')
    repair.type = 'button'
    repair.textContent = t('auditRepair')
    repair.addEventListener('click', () => handlers.onRepair())
    section.append(repair)
    return section
  }

  if (state.attention.length === 0) {
    section.append(line(doc, 'attention-empty', t('overviewNothing')))
    // "Nothing needs you" is the most damaging sentence in this product to say
    // without saying when it was last true.
    section.append(
      line(
        doc,
        'attention-checked',
        state.lastChecked === null
          ? t('overviewNeverChecked')
          : t('overviewLastChecked', state.lastChecked),
      ),
    )
    return section
  }

  const title = doc.createElement('h2')
  title.setAttribute('data-role', 'attention-title')
  title.textContent = t('overviewAttention', String(state.attention.length))
  section.append(title)

  const list = doc.createElement('ul')
  list.setAttribute('data-role', 'attention-list')
  for (const item of state.attention.slice(0, ATTENTION_SHOWN)) {
    list.append(attentionRow(doc, item, handlers))
  }
  section.append(list)

  const rest = state.attention.length - ATTENTION_SHOWN
  if (rest > 0) {
    section.append(line(doc, 'attention-more', t('overviewMore', String(rest))))
  }
  return section
}

function attentionRow(doc: Document, item: AttentionItem, handlers: OverviewHandlers): HTMLElement {
  const row = doc.createElement('li')
  row.setAttribute('data-role', 'attention-item')
  row.setAttribute('data-severity', item.severity)

  const link = doc.createElement('a')
  link.setAttribute('data-role', 'attention-link')
  link.href = item.href
  link.addEventListener('click', () => handlers.onOpen(item.area))

  const mark = doc.createElement('span')
  mark.setAttribute('data-role', 'attention-mark')
  mark.setAttribute('aria-hidden', 'true')
  mark.textContent = SEVERITY_MARK[item.severity]

  const word = doc.createElement('span')
  word.setAttribute('data-role', 'attention-severity')
  word.textContent = t(SEVERITY_WORD[item.severity])

  const what = doc.createElement('span')
  what.setAttribute('data-role', 'attention-what')
  what.textContent = item.what

  link.append(mark, word, what)

  // Source and time travel with the verdict, always — every screen in this
  // product owes the reader where a claim came from and when.
  const origin = doc.createElement('span')
  origin.setAttribute('data-role', 'attention-origin')
  origin.textContent =
    item.where === null ? item.when : t('overviewOrigin', item.where, item.when)

  row.append(link, origin)
  return row
}

function areaList(
  doc: Document,
  areas: readonly AreaRow[],
  handlers: OverviewHandlers,
): HTMLElement {
  const nav = doc.createElement('nav')
  nav.setAttribute('data-role', 'areas')
  nav.setAttribute('aria-label', t('overviewAreas'))

  const list = doc.createElement('ul')
  list.setAttribute('data-role', 'area-list')

  for (const area of areas) {
    const row = doc.createElement('li')
    row.setAttribute('data-role', 'area')
    row.setAttribute('data-area', area.id)

    // A real link, not a button: browser back and forward then work without a
    // router, and the address is copyable and openable in a new tab.
    const link = doc.createElement('a')
    link.setAttribute('data-role', 'area-link')
    link.href = area.href
    link.textContent = area.label
    link.addEventListener('click', () => handlers.onOpen(area.id))

    const state = doc.createElement('span')
    state.setAttribute('data-role', 'area-state')
    if (area.state === null) {
      // The single most important branch on this screen.
      state.setAttribute('data-unread', 'true')
      state.textContent = t('overviewStateUnread')
    } else {
      state.textContent = area.state
    }

    row.append(link, state)
    list.append(row)
  }

  nav.append(list)
  return nav
}

function line(doc: Document, role: string, message: string): HTMLElement {
  const el = doc.createElement('p')
  el.setAttribute('data-role', role)
  el.textContent = message
  return el
}
