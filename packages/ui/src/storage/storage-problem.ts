import { t } from '@okolos/i18n'

/**
 * The screen for a local store this build cannot use.
 *
 * There was none, and the absence had a shape: a profile written by a later
 * build answers every read with a `VersionError`, so the options page rendered
 * the browser's own sentence about requested and existing versions **once per
 * panel**, six times, in a page whose every section was otherwise empty. Nothing
 * told the user which of two very different things had happened — their data is
 * intact and this build is too old, or the store is damaged — and the two have
 * different remedies.
 *
 * So: one panel instead of six errors, the reason in a sentence, and the two
 * things a person can actually do. Reinstalling the newer build keeps everything;
 * clearing keeps nothing, and the button says so rather than asking "are you
 * sure?", which tells the reader nothing they did not already know.
 */

export type StorageProblemKind = 'from-a-newer-version' | 'shape-incomplete' | 'blocked' | 'unknown'

export interface StorageProblemProps {
  readonly kind: StorageProblemKind
  /** The version found in the profile, when it could be read. */
  readonly found: number | null
  /** The version this build understands. */
  readonly expected: number
  /** The underlying message, for the person who will report this. */
  readonly detail: string
}

export interface StorageProblemHandlers {
  readonly onRetry: () => void
  /** Deletes the local store. Destructive, and the label says what goes. */
  readonly onReset: () => void
}

/**
 * Which problem gets which sentence: a product decision, so it stays in code
 * while the wording lives in `_locales`.
 *
 * Named `..._KEY` and annotated as a `Record` because that is the convention the
 * catalogue gate recognises — a mapping declared any other way makes its keys
 * look translated-and-never-shown, which is how eleven live keys were once
 * reported dead.
 */
const EXPLANATION_KEY: Record<StorageProblemKind, string> = {
  'from-a-newer-version': 'storageNewerVersion',
  'shape-incomplete': 'storageShapeIncomplete',
  blocked: 'storageBlocked',
  unknown: 'storageUnknown',
}

export function renderStorageProblem(
  doc: Document,
  props: StorageProblemProps,
  handlers: StorageProblemHandlers,
): HTMLElement {
  const section = doc.createElement('section')
  section.setAttribute('data-role', 'storage-problem')
  section.setAttribute('role', 'alert')

  const heading = doc.createElement('h2')
  heading.textContent = t('storageHeading')
  section.append(heading)

  section.append(line(doc, 'storage-why', t(EXPLANATION_KEY[props.kind])))

  /**
   * The two versions, when both are known.
   *
   * This is the line that tells the user whether updating will help: a profile at
   * 9 against a build that speaks 4 is a rollback, and there is a build out there
   * that reads it. Without the numbers the same sentence could mean anything.
   */
  if (props.found !== null) {
    section.append(
      line(doc, 'storage-versions', t('storageVersions', String(props.found), String(props.expected))),
    )
  }

  // Verbatim, and last: it is the sentence a bug report needs and the one a user
  // should not have to read first.
  section.append(line(doc, 'storage-detail', props.detail))

  const actions = doc.createElement('div')
  actions.setAttribute('data-role', 'actions')
  actions.append(
    button(doc, 'storage-retry', t('storageRetry'), handlers.onRetry, true),
    button(doc, 'storage-reset', t('storageReset'), handlers.onReset),
  )
  section.append(actions, line(doc, 'storage-reset-note', t('storageResetNote')))

  return section
}

function line(doc: Document, role: string, content: string): HTMLParagraphElement {
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
