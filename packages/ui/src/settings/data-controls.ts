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
    button(doc, 'export', t('dataExport'), () => void exportNow(), true),
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

  /**
   * Exporting, with the refusal on screen.
   *
   * It was `() => void handlers.onExport()`, so a rejected export was a click
   * that did nothing and said nothing. Whatever went wrong — the database, the
   * download — the user is owed the sentence.
   */
  async function exportNow(): Promise<void> {
    try {
      await handlers.onExport()
      note('export-failed', null)
    } catch (cause) {
      note('export-failed', t('dataExportFailed', String(cause)))
    }
  }

  /**
   * One slot per kind of note: set its words, or take it away.
   *
   * The rule is not "reuse the element" — a plant proved that branch made no
   * observable difference and it is gone. The rule is **where** this is called:
   * removing the old note before an `await` and appending after it is what
   * produced three identical failure lines from three clicks on a failing export,
   * because all three removed nothing, all three waited, and all three appended.
   * Both halves happen here, after the answer is known, and the clicks are the
   * user's — they will double-click, and the screen must hold one answer.
   */
  function note(role: string, content: string | null): void {
    section.querySelector<HTMLElement>(`[data-role=${role}]`)?.remove()
    if (content !== null) section.append(text(doc, role, content))
  }

  /** The retry button, created once however many failures pass through. */
  function offerRetry(): void {
    if (section.querySelector('[data-role=wipe-retry]')) return
    section.append(button(doc, 'wipe-retry', t('dataWipeRetry'), () => void run()))
  }

  async function run(): Promise<void> {
    section.querySelector('[data-role=confirm]')?.remove()

    /**
     * Three outcomes, and the third one used to be silence.
     *
     * `void run()` swallowed a rejection, and the confirmation had already been
     * removed by then: the user clicked "yes, delete it", the dialog vanished,
     * nothing was deleted, and a dialog vanishing is what success looks like. The
     * handler here opens the database first, so "could not start" is the ordinary
     * failure and not an exotic one.
     *
     * It is reported separately from a partial wipe because it is a different
     * fact. A partial wipe leaves some of the user's data gone and names which;
     * a wipe that never began leaves everything, and naming stores that were
     * never touched would be inventing a state.
     */
    let outcome: WipeOutcome
    try {
      outcome = await handlers.onWipe()
    } catch (cause) {
      note('wipe-failed', t('dataWipeUnavailable', String(cause)))
      offerRetry()
      return
    }

    if (outcome.ok) {
      // Nothing left to say about a failure that is over.
      note('wipe-failed', null)
      section.querySelector('[data-role=wipe-retry]')?.remove()
      handlers.onWiped()
      return
    }

    // A partial wipe reported as success is the one outcome that makes someone
    // stop checking, so the failure is named store by store.
    note('wipe-failed', t('dataWipePartial', outcome.failed.join(', ')))
    offerRetry()
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
