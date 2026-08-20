import { t } from '@okolos/i18n'

import { toPortable, type Checklist, type PortableChecklist } from '@okolos/core-recovery'

/**
 * SCR-13 — the recovery checklist.
 *
 * Ordered by damage, not by convenience, and every step carries its reason: a
 * list of instructions without reasons is followed once, badly, and abandoned
 * at the first inconvenient step. Steps that cannot be done in this browser say
 * so, because discovering that halfway through is where people stop — and now
 * they can be taken along, as text the user moves themselves.
 */

export interface RecoveryHandlers {
  readonly onToggle: (stepId: string, done: boolean) => void
  readonly onArchive: () => void
  /** Copies the remaining steps. Optional: the text is on screen either way. */
  readonly onCopy?: (text: string) => void
}

/**
 * A step's id to its words. Two tables, because the locale gate reads `const *_KEY`
 * maps and cannot see a computed key — with `t(`recoveryStepTitle${id}`)` all eighteen
 * of these messages would read as dead and be deleted by the next sweep (B-75).
 *
 * The mapping (which step gets which sentence) is a product decision and stays in code;
 * the sentences are translations and live in `_locales`. Same split as `SEVERITY_KEY`.
 */
const STEP_TITLE_KEY: Record<string, string> = {
  disconnect: 'recoveryStepTitleDisconnect',
  'passwords-elsewhere': 'recoveryStepTitlePasswordsElsewhere',
  sessions: 'recoveryStepTitleSessions',
  'two-factor': 'recoveryStepTitleTwoFactor',
  scan: 'recoveryStepTitleScan',
  bank: 'recoveryStepTitleBank',
  'remote-access': 'recoveryStepTitleRemoteAccess',
  'change-password': 'recoveryStepTitleChangePassword',
  watch: 'recoveryStepTitleWatch',
}

const STEP_WHY_KEY: Record<string, string> = {
  disconnect: 'recoveryStepWhyDisconnect',
  'passwords-elsewhere': 'recoveryStepWhyPasswordsElsewhere',
  sessions: 'recoveryStepWhySessions',
  'two-factor': 'recoveryStepWhyTwoFactor',
  scan: 'recoveryStepWhyScan',
  bank: 'recoveryStepWhyBank',
  'remote-access': 'recoveryStepWhyRemoteAccess',
  'change-password': 'recoveryStepWhyChangePassword',
  watch: 'recoveryStepWhyWatch',
}

/** The heading of the carried text, by incident. */
const PORTABLE_HEADING_KEY: Record<string, string> = {
  'pasted-command': 'recoveryPortableAfterPasted',
  'entered-password': 'recoveryPortableAfterPassword',
  'called-number': 'recoveryPortableAfterCall',
  'not-sure': 'recoveryPortableAfterUnsure',
}

/**
 * A step's words, or its id when the table has no entry.
 *
 * The fallback is the id rather than an empty string: a step added to the package and
 * forgotten here shows `two-factor` on screen, which is wrong and **visible**. An empty
 * label is wrong and invisible, and this is the screen a person opens in a panic.
 */
function words(id: string, table: Record<string, string>): string {
  const key = table[id]
  return key === undefined ? id : t(key)
}

export function renderRecovery(
  doc: Document,
  checklist: Checklist,
  handlers: RecoveryHandlers,
): HTMLElement {
  const root = doc.createElement('section')
  root.setAttribute('data-role', 'recovery')
  root.setAttribute('data-kind', checklist.kind)

  const heading = doc.createElement('h1')
  heading.textContent = t('recoveryTitle')
  root.append(heading)

  if (checklist.generic) {
    root.append(
      text(
        doc,
        'generic',
        t('recoveryBroadest'),
      ),
    )
  }

  root.append(
    text(
      doc,
      'progress',
      checklist.remaining === 0
        ? t('recoveryAllDone')
        : `${checklist.remaining} step${checklist.remaining === 1 ? '' : 's'} left, most important first.`,
    ),
  )

  const list = doc.createElement('ol')
  list.setAttribute('data-role', 'steps')

  for (const step of checklist.steps) {
    const done = checklist.done.includes(step.id)
    const item = doc.createElement('li')
    item.setAttribute('data-role', 'step')
    item.setAttribute('data-step', step.id)
    if (done) item.setAttribute('data-done', 'true')

    const control = doc.createElement('input')
    control.type = 'checkbox'
    control.checked = done
    control.id = `okolos-step-${step.id}`
    control.setAttribute('data-role', 'done')
    control.addEventListener('change', () => handlers.onToggle(step.id, control.checked))

    // Explicitly associated, not merely adjacent: a checkbox whose label is a
    // sibling is an unlabelled checkbox to everything but a sighted mouse user.
    const label = doc.createElement('label')
    label.htmlFor = control.id
    label.textContent = words(step.id, STEP_TITLE_KEY)

    item.append(control, label, text(doc, 'why', words(step.id, STEP_WHY_KEY)))
    if (step.elsewhere) {
      item.append(text(doc, 'elsewhere', t('recoveryElsewhere')))
    }
    list.append(item)
  }

  root.append(list)

  if (checklist.remaining === 0) {
    root.append(button(doc, 'archive', t('recoveryArchive'), handlers.onArchive))
  } else {
    root.append(portableBlock(doc, checklist, handlers))
  }

  return root
}

/**
 * The steps you have to finish somewhere else, in a form you can take there.
 *
 * Not a sync feature. A recovery record says which incident happened to a
 * particular person, and shipping it to a server so it can appear on their
 * phone would trade this product's one real promise for something they can get
 * by pasting text into a note.
 *
 * The text is rendered whether or not the copy button works — a clipboard
 * permission the browser declines must not be the thing that strands someone
 * mid-recovery. And the copy happens on a real click and shows exactly what it
 * copied, which is the distinction this product's own ClickFix detector draws.
 */
/**
 * The carried text, assembled where the catalogue is.
 *
 * `toPortable` decides what remains and in what order — a product decision. Turning
 * that into lines is presentation, and it used to live in a zero-dependency package
 * with the words baked in English (B-75). The numbering comes from the package, so the
 * order cannot drift between the screen and the text a person takes with them.
 */
function portableText(checklist: Checklist, portable: PortableChecklist): string {
  const heading = PORTABLE_HEADING_KEY[checklist.kind]
  const lines: string[] = [
    heading === undefined ? checklist.kind : t(heading),
    '',
    portable.ordered.length === 0
      ? t('recoveryPortableNothingLeft')
      : t('recoveryPortableStepsLeft', String(portable.ordered.length)),
  ]

  for (const { index, step } of portable.ordered) {
    const notHere = step.elsewhere ? t('recoveryPortableNotHere') : ''
    lines.push('', `${index}. ${words(step.id, STEP_TITLE_KEY)}${notHere}`)
    // The reason travels with the step. A list of bare instructions is followed once,
    // badly, and abandoned at the first inconvenient one.
    lines.push(`${t('recoveryPortableWhyLabel')}${words(step.id, STEP_WHY_KEY)}`)
  }

  return lines.join('\n')
}

function portableBlock(
  doc: Document,
  checklist: Checklist,
  handlers: RecoveryHandlers,
): HTMLElement {
  const portable = toPortable(checklist)
  const block = doc.createElement('section')
  block.setAttribute('data-role', 'portable')

  const heading = doc.createElement('h2')
  heading.textContent = t('recoveryPortableTitle')
  block.append(heading)

  block.append(
    text(
      doc,
      'portable-why',
      portable.elsewhere.length === 0
        ? t('recoveryPortableAllHere')
        : t('recoveryPortableElsewhere', String(portable.elsewhere.length)),
    ),
  )

  const carried = portableText(checklist, portable)
  const pre = doc.createElement('pre')
  pre.setAttribute('data-role', 'portable-text')
  pre.textContent = carried
  block.append(pre)

  if (handlers.onCopy) {
    const copy = handlers.onCopy
    block.append(button(doc, 'copy', t('recoveryCopy'), () => copy(carried)))
  }

  return block
}

function text(doc: Document, role: string, content: string): HTMLParagraphElement {
  const el = doc.createElement('p')
  el.setAttribute('data-role', role)
  el.textContent = content
  return el
}

function button(doc: Document, role: string, label: string, onClick: () => void): HTMLButtonElement {
  const el = doc.createElement('button')
  el.type = 'button'
  el.setAttribute('data-role', role)
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}
