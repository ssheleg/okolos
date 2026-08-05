/**
 * SCR-14 — the public status page.
 *
 * The person reading this is a site owner whose customers cannot reach them, and
 * who has no account here and no reason to make one. Two minutes is the budget:
 * enter the domain, learn why, and either be told nothing is recorded or be
 * pointed at whoever actually listed it.
 *
 * The rule that shapes every state: a lookup that failed is never shown as a
 * clean result. An owner acting on that would spend a day discovering it was
 * wrong.
 */

export type StatusState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking'; readonly domain: string }
  | { readonly kind: 'not-listed'; readonly domain: string }
  | {
      readonly kind: 'listed'
      readonly domain: string
      readonly feed: string
      readonly entryDate: string
      readonly appealTo: string
    }
  | { readonly kind: 'unknown'; readonly domain: string; readonly detail: string }
  | { readonly kind: 'appealed'; readonly domain: string; readonly reference: string }

export interface StatusHandlers {
  readonly onCheck: (domain: string) => void
  readonly onAppeal: (domain: string) => void
}

export function renderStatus(
  doc: Document,
  state: StatusState,
  handlers: StatusHandlers,
): HTMLElement {
  const root = doc.createElement('main')
  root.setAttribute('data-role', 'status')
  root.setAttribute('data-state', state.kind)

  const heading = doc.createElement('h1')
  heading.textContent = 'Check a domain'
  root.append(heading)

  const field = doc.createElement('input')
  field.type = 'text'
  field.setAttribute('data-role', 'domain')
  field.placeholder = 'yoursite.com'
  if ('domain' in state) field.value = state.domain

  const check = doc.createElement('button')
  check.type = 'button'
  check.setAttribute('data-role', 'check')
  check.setAttribute('data-primary', 'true')
  check.textContent = 'Check domain'
  check.addEventListener('click', () => handlers.onCheck(field.value))

  root.append(field, check)

  switch (state.kind) {
    case 'idle':
      root.append(
        text(doc, 'hint', 'No account is needed, and nothing about you is recorded by this check.'),
      )
      break

    case 'checking':
      root.append(text(doc, 'status-line', `Looking up ${state.domain}…`))
      break

    case 'not-listed':
      root.append(
        text(doc, 'verdict', `Nothing is recorded for ${state.domain}.`),
        text(doc, 'note', 'If your visitors are seeing a warning, it is not coming from here.'),
      )
      break

    case 'listed': {
      root.append(
        text(doc, 'verdict', `${state.domain} is listed by ${state.feed}, entry dated ${state.entryDate}.`),
      )
      if (state.appealTo === 'okolos') {
        const appeal = doc.createElement('button')
        appeal.type = 'button'
        appeal.setAttribute('data-role', 'appeal')
        appeal.textContent = 'Appeal this listing'
        appeal.addEventListener('click', () => handlers.onAppeal(state.domain))
        root.append(appeal)
      } else {
        root.append(
          text(
            doc,
            'upstream',
            `This listing is ${state.feed}'s, not ours. Their own appeal process is the one that will remove it; we follow their data.`,
          ),
        )
      }
      break
    }

    case 'unknown':
      // Never a clean result for a question that could not be asked.
      root.append(
        text(doc, 'error', `The status of ${state.domain} could not be checked: ${state.detail}.`),
        text(doc, 'error-note', 'This does not mean the domain is clear.'),
      )
      break

    case 'appealed':
      root.append(
        text(doc, 'reference', `Appeal recorded for ${state.domain}. Your reference is ${state.reference}.`),
      )
      break
  }

  return root
}

function text(doc: Document, role: string, content: string): HTMLParagraphElement {
  const el = doc.createElement('p')
  el.setAttribute('data-role', role)
  el.textContent = content
  return el
}
