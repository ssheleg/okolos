/**
 * The side-by-side, which is the only thing worth showing for a lookalike.
 *
 * Telling someone "this domain is suspicious" asks them to take our word for
 * it. Putting what they visited next to what it imitates, with the decoded
 * spelling underneath, lets them see the difference themselves — and seeing it
 * once is what makes them notice the next one without us.
 */

import { t } from '@okolos/i18n'

export interface ComparisonProps {
  /** The host as the address bar holds it, punycode and all. */
  readonly visited: string
  /** What it renders as, once decoded. Equal to `visited` for plain ASCII. */
  readonly decoded: string
  readonly resembles: string
  readonly kind: 'mixed-script' | 'homograph' | 'typo' | 'tld-swap' | 'brand-subdomain'
}

export interface ComparisonHandlers {
  readonly onLeave: () => void
  readonly onTrust: () => void
  readonly onClose: () => void
}

/**
 * The reason, as a catalogue key.
 *
 * Which kind of resemblance gets which explanation is a product decision and
 * stays here; the sentence is a translation and lives in `_locales`.
 */
const EXPLANATION_KEY: Record<ComparisonProps['kind'], string> = {
  'mixed-script': 'comparisonReasonMixedScript',
  homograph: 'comparisonReasonHomograph',
  typo: 'comparisonReasonTypo',
  'tld-swap': 'comparisonReasonTldSwap',
  'brand-subdomain': 'comparisonReasonBrandSubdomain',
}

export function renderComparison(
  doc: Document,
  props: ComparisonProps,
  handlers: ComparisonHandlers,
): HTMLElement {
  const root = doc.createElement('section')
  root.setAttribute('data-role', 'comparison')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-label', t('comparisonAria'))

  const title = doc.createElement('h2')
  title.textContent = t('comparisonTitle')
  root.append(title)

  root.append(
    row(doc, 'visited', t('comparisonVisited'), props.visited),
    ...(props.decoded === props.visited ? [] : [row(doc, 'decoded', t('comparisonDecoded'), props.decoded)]),
    row(doc, 'resembles', t('comparisonResembles'), props.resembles),
    text(doc, 'why', t(EXPLANATION_KEY[props.kind])),
  )

  const actions = doc.createElement('div')
  actions.setAttribute('data-role', 'actions')
  actions.append(
    button(doc, 'leave', t('comparisonLeave'), handlers.onLeave, true),
    button(doc, 'trust', t('comparisonTrust'), handlers.onTrust),
    button(doc, 'close', t('comparisonClose'), handlers.onClose),
  )
  root.append(actions)

  root.append(
    text(
      doc,
      'trust-note',
      t('comparisonTrustNote'),
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
