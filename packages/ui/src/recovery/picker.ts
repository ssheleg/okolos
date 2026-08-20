import type { IncidentKind } from '@okolos/core-recovery'
import { t } from '@okolos/i18n'

/**
 * Where a person starts a recovery checklist without waiting to be told.
 *
 * Every checklist opened because the *product* detected something: a ClickFix warning, a
 * trap, a journal link. Someone who already ran the pasted command and only realised
 * afterwards had no way in — while SCN-025's entry point has read "the recovery entry in
 * the popup" since it was written, and SCR-13's `empty` state has read "the picker,
 * nothing else". Recorded, and never built (B-59).
 *
 * Four choices, because four playbooks exist. The screen record listed "installed
 * something" as a fifth and `core-recovery` has no steps for it — offering a choice whose
 * answer is the broad list under a specific name would be the screen lying about how much
 * it knows. "Not sure" is on the list precisely so the honest answer is a real option and
 * not the one you pick by giving up.
 */
export interface PickerHandlers {
  readonly onPick: (kind: IncidentKind) => void
}

/**
 * The label for each, in the order a person is asked to recognise themselves in.
 *
 * Named `…_KEY` because `tools/locales.test.ts` reads catalogue keys out of tables with
 * that suffix and out of nothing looser. Named `INCIDENT_LABEL`, these four live messages
 * read to it as translated-and-never-shown — the second time in one session that a table
 * of keys under a name outside the convention made its messages look dead. The convention
 * is checked now rather than remembered: see that file's own test.
 */
export const INCIDENT_LABEL_KEY: Readonly<Record<IncidentKind, string>> = {
  'pasted-command': 'recoveryPickPasted',
  'entered-password': 'recoveryPickPassword',
  'called-number': 'recoveryPickCalled',
  'not-sure': 'recoveryPickUnsure',
}

/**
 * `not-sure` last, and that is a decision rather than an ordering accident: put first, it
 * is what a hurried person picks to skip the question, and the checklist they get is the
 * broad one when a specific one existed.
 */
export const PICK_ORDER: readonly IncidentKind[] = [
  'pasted-command',
  'entered-password',
  'called-number',
  'not-sure',
]

export function renderIncidentPicker(doc: Document, handlers: PickerHandlers): HTMLElement {
  const root = doc.createElement('section')
  root.setAttribute('data-role', 'incident-picker')

  const heading = doc.createElement('h1')
  heading.textContent = t('recoveryPickTitle')

  const ask = doc.createElement('p')
  ask.setAttribute('data-role', 'pick-ask')
  ask.textContent = t('recoveryPickAsk')

  const list = doc.createElement('ul')
  list.setAttribute('data-role', 'pick-list')

  for (const kind of PICK_ORDER) {
    const item = doc.createElement('li')
    const choice = doc.createElement('button')
    choice.type = 'button'
    choice.setAttribute('data-role', 'pick')
    choice.setAttribute('data-kind', kind)
    choice.textContent = t(INCIDENT_LABEL_KEY[kind])
    choice.addEventListener('click', () => handlers.onPick(kind))
    item.append(choice)
    list.append(item)
  }

  root.append(heading, ask, list)
  return root
}
