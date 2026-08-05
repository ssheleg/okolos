import type { InventoryChange, PackageReport } from '@okolos/core-extensions'

/**
 * SCR-09 — the extensions watch.
 *
 * The delta is the product, not the list. A user who wanted an inventory has
 * one in their browser already; what no browser shows is that the colour picker
 * they installed two years ago now reads every page, or that it belongs to
 * somebody else this month. So changes come first and the inventory sits under
 * them.
 *
 * The action is real. "Disable" turns the extension off, immediately, from
 * here — a security screen whose only verb is "review" leaves the user exactly
 * where they started.
 *
 * "Inspect package" exists because no browser hands one extension another's
 * code, so a static analyser has no runtime source to read. Rather than ship an
 * analyser nothing can call, the screen lets the user point at a package they
 * downloaded — the file is read on the device and never sent anywhere. What the
 * report says about its own worth is part of the output: `eval` appears in
 * polyfills and minified code looks obfuscated, so findings are evidence, not a
 * verdict.
 */

export interface ExtensionRow {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly permissions: readonly string[]
  readonly enabled: boolean
}

export type ExtensionsState =
  | { readonly kind: 'unsupported'; readonly why: string }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready'
      readonly changes: readonly InventoryChange[]
      readonly installed: readonly ExtensionRow[]
      /** The last package the user asked about, if any. */
      readonly analysis: PackageReport | null
      /** Why there is no analysis, when there is none. Never silence. */
      readonly analysisNote: string
    }

export interface ExtensionsHandlers {
  readonly onDisable: (id: string) => void
  readonly onTrust: (id: string) => void
  /** Hands over a package the user chose. Read locally; nothing is uploaded. */
  readonly onInspect: (file: File) => void
}

export function renderExtensions(
  doc: Document,
  state: ExtensionsState,
  handlers: ExtensionsHandlers,
): HTMLElement {
  const root = doc.createElement('section')
  root.setAttribute('data-role', 'extensions')
  root.setAttribute('data-state', state.kind)

  const heading = doc.createElement('h1')
  heading.textContent = 'What changed in your extensions'
  root.append(heading)

  if (state.kind === 'unsupported') {
    root.append(text(doc, 'unsupported', state.why))
    return root
  }

  if (state.kind === 'loading') {
    root.append(text(doc, 'status', 'Reading what is installed…'))
    return root
  }

  if (state.kind === 'error') {
    // An empty list here would read as "nothing changed", which is the one
    // thing this screen must not say when it does not know.
    root.append(
      text(doc, 'error', `The inventory could not be read: ${state.message}`),
      text(doc, 'error-note', 'This is not a statement that nothing changed.'),
    )
    return root
  }

  if (state.changes.length === 0) {
    root.append(text(doc, 'no-changes', 'Nothing has changed since the last check.'))
  } else {
    for (const change of state.changes) root.append(changeRow(doc, change, handlers))
  }

  root.append(analysisBlock(doc, state.analysis, state.analysisNote, handlers))

  const list = doc.createElement('div')
  list.setAttribute('data-role', 'installed')
  const listHeading = doc.createElement('h2')
  listHeading.textContent = `Installed (${state.installed.length})`
  list.append(listHeading)

  for (const entry of state.installed) {
    const row = doc.createElement('article')
    row.setAttribute('data-role', 'installed-row')
    row.setAttribute('data-extension', entry.id)
    row.append(
      text(doc, 'name', `${entry.name} ${entry.version}`),
      text(
        doc,
        'permissions',
        entry.permissions.length === 0
          ? 'No special permissions.'
          : `Can use: ${entry.permissions.join(', ')}`,
      ),
    )
    if (entry.enabled) row.append(button(doc, 'disable', 'Disable', () => handlers.onDisable(entry.id)))
    else row.append(text(doc, 'disabled', 'Already off.'))
    list.append(row)
  }

  root.append(list)
  return root
}

function analysisBlock(
  doc: Document,
  report: PackageReport | null,
  note: string,
  handlers: ExtensionsHandlers,
): HTMLElement {
  const block = doc.createElement('section')
  block.setAttribute('data-role', 'analysis')

  const heading = doc.createElement('h2')
  heading.textContent = 'Inspect a package'
  block.append(heading, text(doc, 'analysis-note', note))

  const picker = doc.createElement('input')
  picker.type = 'file'
  picker.id = 'okolos-inspect-package'
  picker.setAttribute('data-role', 'inspect')
  picker.addEventListener('change', () => {
    const file = picker.files?.[0]
    if (file) handlers.onInspect(file)
  })

  const label = doc.createElement('label')
  label.htmlFor = picker.id
  label.textContent = 'Choose a package file'
  block.append(label, picker)

  if (!report) return block

  block.append(
    text(
      doc,
      'analysis-summary',
      report.findings.length === 0
        ? 'Nothing of note was found in the text of this file.'
        : `${report.findings.length} thing${report.findings.length === 1 ? '' : 's'} worth a look.`,
    ),
  )

  for (const finding of report.findings) {
    const row = doc.createElement('article')
    row.setAttribute('data-role', 'finding')
    row.setAttribute('data-kind', finding.kind)
    row.append(text(doc, 'evidence', finding.evidence))
    block.append(row)
  }

  // The report's own caveat, shown rather than filed away: it is the difference
  // between evidence and an accusation.
  block.append(text(doc, 'analysis-caveat', report.note))
  return block
}

function changeRow(
  doc: Document,
  change: InventoryChange,
  handlers: ExtensionsHandlers,
): HTMLElement {
  const row = doc.createElement('article')
  row.setAttribute('data-role', 'change')
  row.setAttribute('data-kind', change.kind)
  row.setAttribute('data-severity', change.severity)
  row.append(text(doc, 'detail', change.detail))

  const actions = doc.createElement('div')
  actions.setAttribute('data-role', 'change-actions')
  actions.append(
    button(doc, 'disable', 'Disable it', () => handlers.onDisable(change.id), true),
    button(doc, 'trust', 'This change is fine', () => handlers.onTrust(change.id)),
  )
  row.append(actions)
  return row
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
