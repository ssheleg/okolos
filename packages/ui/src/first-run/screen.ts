/**
 * The first-run screen: a real, local result within seconds of installing.
 *
 * The hardest requirement here is not speed, it is honesty. This version does
 * not hold the permissions needed to inventory tabs or extensions — they arrive
 * with the features that justify them — so the screen names the checks that did
 * not run and why, rather than showing a tidy green list that implies a scan
 * nobody performed. A first impression built on an overstatement is the same
 * mistake the incumbents make with "203 threats blocked".
 */

export type CheckState = 'running' | 'ok' | 'unavailable' | 'failed'

export interface CheckRow {
  readonly id: string
  readonly label: string
  readonly state: CheckState
  /** For ok: what it means. For unavailable or failed: why. */
  readonly note: string
}

export interface FirstRunProps {
  readonly checks: readonly CheckRow[]
  readonly findings: number
}

export interface FirstRunHandlers {
  readonly onContinue: () => void
  readonly onSkip: () => void
  readonly onOpenAudit: () => void
}

const STATE_WORDING: Record<CheckState, string> = {
  running: 'checking',
  ok: 'done',
  unavailable: 'not available yet',
  failed: 'could not run',
}

export function renderFirstRun(
  doc: Document,
  props: FirstRunProps,
  handlers: FirstRunHandlers,
): HTMLElement {
  const section = doc.createElement('section')
  section.setAttribute('data-role', 'first-run')

  const heading = doc.createElement('h1')
  heading.textContent = 'Okolos is on'
  section.append(heading, intro(doc))

  const list = doc.createElement('ul')
  list.setAttribute('data-role', 'checks')
  for (const check of props.checks) list.append(row(doc, check))
  section.append(list, result(doc, props))

  const actions = doc.createElement('div')
  actions.setAttribute('data-role', 'actions')
  const cta = button(doc, 'continue', 'See what to do first', handlers.onContinue, true)
  // A primary action with nothing behind it teaches people to ignore it.
  cta.disabled = props.findings === 0
  actions.append(
    cta,
    button(doc, 'skip', 'Skip for now', handlers.onSkip),
    button(doc, 'what-this-sends', 'What this sends', handlers.onOpenAudit),
  )
  if (props.checks.some((c) => c.state === 'failed')) {
    actions.append(button(doc, 'retry', 'Run the checks again', handlers.onContinue))
  }
  section.append(actions)

  return section
}

function intro(doc: Document): HTMLParagraphElement {
  const el = doc.createElement('p')
  el.setAttribute('data-role', 'intro')
  el.textContent =
    'Everything below runs on this device. Nothing about the pages you visit is sent anywhere — ' +
    'you can check that yourself at any time.'
  return el
}

function row(doc: Document, check: CheckRow): HTMLLIElement {
  const item = doc.createElement('li')
  item.setAttribute('data-role', 'check')
  item.setAttribute('data-state', check.state)

  const label = doc.createElement('span')
  label.setAttribute('data-role', 'check-label')
  label.textContent = check.label

  // The state is a word, not a colour or a spinner: a bare spinner tells the
  // reader that something is happening and nothing about what.
  const state = doc.createElement('span')
  state.setAttribute('data-role', 'check-state')
  state.textContent = STATE_WORDING[check.state]

  const note = doc.createElement('span')
  note.setAttribute('data-role', 'check-note')
  note.textContent = check.note

  item.append(label, state, note)
  return item
}

function result(doc: Document, props: FirstRunProps): HTMLParagraphElement {
  const el = doc.createElement('p')
  el.setAttribute('data-role', 'result')

  const ran = props.checks.filter((c) => c.state === 'ok').length
  const incomplete = props.checks.some((c) => c.state === 'failed' || c.state === 'unavailable')

  const parts: string[] = []
  parts.push(
    props.findings === 0
      ? `Nothing found — ${ran} check${ran === 1 ? '' : 's'} ran.`
      : `${props.findings} thing${props.findings === 1 ? '' : 's'} need your attention.`,
  )
  if (incomplete) {
    parts.push('This run was partial: the checks marked above did not complete.')
  }

  el.textContent = parts.join(' ')
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
  el.setAttribute('data-role', role)
  if (primary) el.setAttribute('data-primary', 'true')
  el.type = 'button'
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}
