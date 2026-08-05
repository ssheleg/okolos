/**
 * SCR-05 — the block page.
 *
 * It is shown instead of a page, which makes it the most heavy-handed thing
 * this product does to someone's browsing. Two things follow.
 *
 * It names its authority. "Blocked" with no source is a claim the user cannot
 * check and cannot appeal; the feed's name and the date of its entry turn it
 * into one they can. When that metadata is missing the page says so rather
 * than quietly dropping the line — a block whose origin is unknown is still a
 * block, and the user is entitled to know which of the two they are looking at.
 *
 * And it can be overridden. "Continue anyway" is a real button that really
 * works, states that the exception will be remembered and journalled, and does
 * both. A block with no way past it is a block people route around by turning
 * the extension off.
 */

export interface InterstitialProps {
  /** Origin and path of the page that was stopped. Never its query string. */
  readonly url: string
  readonly feed: string | null
  readonly entryDate: string | null
  /** Days since the feed was last updated, when that is known. */
  readonly feedAgeDays: number | null
}

export interface InterstitialHandlers {
  readonly onBack: () => void
  readonly onContinue: () => void
  readonly onOwner: () => void
}

/** Beyond this a feed is old enough that the user should be told. */
const STALE_AFTER_DAYS = 7

export function renderInterstitial(
  doc: Document,
  props: InterstitialProps,
  handlers: InterstitialHandlers,
): HTMLElement {
  const root = doc.createElement('section')
  root.setAttribute('data-role', 'interstitial')

  const heading = doc.createElement('h1')
  heading.textContent = 'This page was blocked before it loaded'
  root.append(heading)

  root.append(text(doc, 'url', props.url))

  root.append(
    text(
      doc,
      'source',
      props.feed === null
        ? 'The list that flagged it could not be identified. The block still applies; open the journal to see what is recorded.'
        : `Flagged by ${props.feed}${props.entryDate ? `, entry dated ${props.entryDate}` : ''}.`,
    ),
  )

  if (props.feedAgeDays !== null && props.feedAgeDays > STALE_AFTER_DAYS) {
    root.append(
      text(
        doc,
        'stale',
        `That list was last updated ${props.feedAgeDays} days ago, so it may be out of date.`,
      ),
    )
  }

  const actions = doc.createElement('div')
  actions.setAttribute('data-role', 'actions')
  actions.append(
    button(doc, 'back', 'Go back', handlers.onBack, true),
    button(doc, 'continue', 'Continue anyway', handlers.onContinue),
    button(doc, 'owner', 'I own this site', handlers.onOwner),
  )
  root.append(actions)

  root.append(
    text(
      doc,
      'continue-note',
      'Continuing remembers this site so you are not asked again, and records the decision in your journal.',
    ),
  )

  return root
}

function text(doc: Document, role: string, content: string): HTMLParagraphElement {
  const el = doc.createElement('p')
  el.setAttribute('data-role', role)
  el.textContent = content
  return el
}

function button(
  doc: Document,
  role: string,
  label: string,
  onClick: () => void,
  primary = false,
): HTMLButtonElement {
  const el = doc.createElement('button')
  el.type = 'button'
  el.setAttribute('data-role', role)
  if (primary) el.setAttribute('data-primary', 'true')
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}
