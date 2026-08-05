/**
 * The side-by-side, which is the only thing worth showing for a lookalike.
 *
 * Telling someone "this domain is suspicious" asks them to take our word for
 * it. Putting what they visited next to what it imitates, with the decoded
 * spelling underneath, lets them see the difference themselves — and seeing it
 * once is what makes them notice the next one without us.
 */

export interface ComparisonProps {
  /** The host as the address bar holds it, punycode and all. */
  readonly visited: string
  /** What it renders as, once decoded. Equal to `visited` for plain ASCII. */
  readonly decoded: string
  readonly resembles: string
  readonly kind: 'mixed-script' | 'homograph' | 'typo' | 'tld-swap'
}

export interface ComparisonHandlers {
  readonly onLeave: () => void
  readonly onTrust: () => void
  readonly onClose: () => void
}

const EXPLANATION: Record<ComparisonProps['kind'], string> = {
  'mixed-script': 'This name is written with letters from more than one alphabet.',
  homograph: 'Some characters here only look like the letters they stand for.',
  typo: 'This name is one typing mistake away from the one it resembles.',
  'tld-swap': 'The name is the same, but the ending after the last dot is different.',
}

export function renderComparison(
  doc: Document,
  props: ComparisonProps,
  handlers: ComparisonHandlers,
): HTMLElement {
  const root = doc.createElement('section')
  root.setAttribute('data-role', 'comparison')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-label', 'Compare this address with the one it resembles')

  const title = doc.createElement('h2')
  title.textContent = 'This address is not the one you may think'
  root.append(title)

  root.append(
    row(doc, 'visited', 'You are on', props.visited),
    ...(props.decoded === props.visited ? [] : [row(doc, 'decoded', 'Which reads as', props.decoded)]),
    row(doc, 'resembles', 'It resembles', props.resembles),
    text(doc, 'why', EXPLANATION[props.kind]),
  )

  const actions = doc.createElement('div')
  actions.setAttribute('data-role', 'actions')
  actions.append(
    button(doc, 'leave', 'Leave', handlers.onLeave, true),
    button(doc, 'trust', 'This is legitimate', handlers.onTrust),
    button(doc, 'close', 'Close', handlers.onClose),
  )
  root.append(actions)

  root.append(
    text(
      doc,
      'trust-note',
      'Marking it legitimate stops the warning for this address and can be undone in settings.',
    ),
  )

  return root
}

function row(doc: Document, role: string, label: string, value: string): HTMLElement {
  const el = doc.createElement('p')
  el.setAttribute('data-role', role)
  const name = doc.createElement('span')
  name.textContent = `${label}: `
  const code = doc.createElement('code')
  // Verbatim: a "tidied" rendering of the very thing being compared would
  // defeat the comparison.
  code.textContent = value
  el.append(name, code)
  return el
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
