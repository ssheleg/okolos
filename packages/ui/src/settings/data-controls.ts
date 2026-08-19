/**
 * Data controls: export everything, or delete everything.
 *
 * The product's claim is that the user owns what it stores, and a claim whose
 * only implementation is an exported function nobody can call is not a claim —
 * that gap was REQ-32. Export needs no confirmation because nothing is lost;
 * wiping asks once, and the question names exactly what is about to go, since
 * "are you sure?" tells the reader nothing they did not already know.
 */

import { t } from '@okolos/i18n'

export interface WipeOutcome {
  readonly ok: boolean
  readonly failed: readonly string[]
}

export interface DataControlsHandlers {
  readonly onExport: () => Promise<void>
  readonly onWipe: () => Promise<WipeOutcome>
  /** Called only when everything really went, so the caller can repaint. */
  readonly onWiped: () => void
}

export function renderDataControls(
  doc: Document,
  handlers: DataControlsHandlers,
  /**
   * Catalogue keys for every kind of data the wipe clears, in the user's words
   * rather than store names.
   *
   * Passed in rather than written here, and the reason is not tidiness: this list
   * held five entries while the wipe cleared nine stores, so the confirmation
   * named findings, journal, audit, exceptions and settings while `models`,
   * `feeds`, `snapshots` and the password-reuse index went unmentioned. A
   * renderer cannot tell whether a list it was given is all of them; the storage
   * schema can, and `Record<StoreName, string>` there makes a new store fail the
   * build until it has words.
   */
  dataKinds: readonly string[],
): HTMLElement {
  // An empty list would render a confirmation that names nothing, which reads as
  // "nothing will be deleted" over a button that deletes everything. Refused
  // loudly at the seam rather than shown quietly.
  if (dataKinds.length === 0) {
    throw new Error('renderDataControls: the wipe confirmation must name what it deletes')
  }

  const section = doc.createElement('section')
  section.setAttribute('data-role', 'data-controls')

  const heading = doc.createElement('h2')
  heading.textContent = t('dataHeading')
  section.append(
    heading,
    text(
      doc,
      'blurb',
      t('dataIntro'),
    ),
  )

  const actions = doc.createElement('div')
  actions.setAttribute('data-role', 'actions')
  actions.append(
    button(doc, 'export', t('dataExport'), () => void handlers.onExport(), true),
    button(doc, 'wipe', t('dataWipe'), () => askFirst()),
  )
  section.append(actions)

  function askFirst(): void {
    if (section.querySelector('[data-role=confirm]')) return

    const confirm = doc.createElement('div')
    confirm.setAttribute('data-role', 'confirm')
    confirm.setAttribute('role', 'alertdialog')

    const list = doc.createElement('ul')
    for (const key of dataKinds) {
      const item = doc.createElement('li')
      item.textContent = t(key)
      list.append(item)
    }

    confirm.append(
      text(doc, 'confirm-title', t('dataConfirmTitle')),
      list,
      text(doc, 'confirm-note', t('dataConfirmNote')),
      button(doc, 'confirm-yes', t('dataConfirmYes'), () => void run()),
      button(doc, 'confirm-no', t('dataConfirmNo'), () => confirm.remove()),
    )
    section.append(confirm)
  }

  async function run(): Promise<void> {
    section.querySelector('[data-role=confirm]')?.remove()
    section.querySelector('[data-role=wipe-failed]')?.remove()
    section.querySelector('[data-role=wipe-retry]')?.remove()

    const outcome = await handlers.onWipe()
    if (outcome.ok) {
      handlers.onWiped()
      return
    }

    // A partial wipe reported as success is the one outcome that makes someone
    // stop checking, so the failure is named store by store.
    section.append(
      text(
        doc,
        'wipe-failed',
        t('dataWipePartial', outcome.failed.join(', ')),
      ),
      button(doc, 'wipe-retry', t('dataWipeRetry'), () => void run()),
    )
  }

  return section
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
  el.setAttribute('data-role', role)
  if (primary) el.setAttribute('data-primary', 'true')
  el.type = 'button'
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}
