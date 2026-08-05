import { analysePackage, type InventoryChange, type PackageReport } from '@okolos/core-extensions'
import { buildChecklist, type StepProgress } from '@okolos/core-recovery'
import { diffSince } from '@okolos/core-queue'
import { detectPlatform } from '@okolos/platform'
import { buildQueue } from '@okolos/core-queue'
import { toQueueItems } from '../popup/state.js'
import {
  renderDataControls,
  renderExtensions,
  renderQueue,
  type ExtensionsState,
  renderLeaks,
  type LeaksState,
  renderJournal,
  renderRecovery,
  renderSelfAudit,
  type PanelState,
} from '@okolos/ui'
import { exportAll, openDb, RETENTION_DAYS, wipeAll, type JournalRecord } from '@okolos/storage'

import { mapJournal } from '../popup/state.js'

/**
 * The options page is, first of all, the self-audit panel: the product's
 * central claim in a form the user can read and export. Beneath it sit the
 * journal — what changed since the last check, not an ever-growing red list —
 * and the data controls, so "you own what this stores" is something a person
 * can act on rather than a sentence in a README.
 */

const platform = detectPlatform()
const root = document.getElementById('root')

/**
 * The leak check is user-initiated, always. Nothing is looked up in the
 * background: the address the user types is theirs, and sending it anywhere is
 * a decision they make each time by pressing the button.
 */
let leaks: LeaksState = { kind: 'idle' }
let address = ''

function leaksSection(): HTMLElement {
  const container = document.createElement('div')

  const field = document.createElement('input')
  field.type = 'email'
  field.setAttribute('data-role', 'address')
  field.placeholder = 'you@example.com'
  field.value = address
  field.addEventListener('input', () => {
    address = field.value
  })

  container.append(
    field,
    renderLeaks(document, leaks, {
      onCheck: () => {
        void (async () => {
          if (!address.includes('@')) return
          leaks = { kind: 'checking' }
          await paintCurrent()
          try {
            const result = await platform.runtime.send('leaks/check', { address })
            leaks = result
              ? { kind: 'ready', inventory: { ...result, leaks: result.leaks } }
              : { kind: 'error', message: 'the check returned nothing' }
          } catch (cause) {
            leaks = { kind: 'error', message: String(cause) }
          }
          await paintCurrent()
        })()
      },
      onResolve: (name) => {
        void (async () => {
          const db = await openDb()
          const now = new Date().toISOString()
          await db.put('journal', {
            id: `leak-resolved:${name}:${now}`,
            createdAt: now,
            kind: 'action',
            detail: { explain: `You marked the ${name} breach as dealt with.`, reason: 'user-allowed' },
          })
          await reload()
        })()
      },
    }),
  )
  return container
}

/**
 * The same queue the popup shows, in the place the first run sends people. One
 * implementation, because the promise is that whatever the user faces is at
 * most three things and always the same three.
 */
let queueExpanded = false

/** The last package the user asked about. Nothing is kept across a reload. */
let lastAnalysis: PackageReport | null = null

async function queueSection(): Promise<HTMLElement> {
  const container = document.createElement('section')
  container.setAttribute('data-role', 'queue-section')

  const heading = document.createElement('h1')
  heading.textContent = 'What needs you'
  container.append(heading)

  try {
    const db = await openDb()
    const items = toQueueItems(await db.getAll('findings'))
    container.append(
      renderQueue(document, buildQueue(items, queueExpanded ? Math.max(items.length, 3) : 3), {
        onAct: (id) => {
          void (async () => {
            const finding = await (await openDb()).get('findings', id)
            const url = finding?.verdict?.subject.ref
            if (url) await platform.tabs.create(url)
          })()
        },
        onShowAll: () => {
          queueExpanded = true
          void reload()
        },
      }),
    )
  } catch (cause) {
    // Never an empty queue in place of a failure: "nothing needs you" is the
    // most damaging sentence in this product to say wrongly.
    const failed = document.createElement('p')
    failed.setAttribute('data-role', 'queue-error')
    failed.textContent = `The queue could not be read: ${String(cause)}`
    container.append(failed)
  }

  return container
}

/**
 * SCR-09. The review runs when the screen opens: this is the moment the user
 * wants the current answer, not the one from last night's alarm.
 */
async function extensionsSection(): Promise<HTMLElement> {
  let state: ExtensionsState
  try {
    const result = await platform.runtime.send('extensions/state', {})
    if (!result) {
      state = { kind: 'error', message: 'the background did not answer' }
    } else if (!result.supported) {
      state = {
        kind: 'unsupported',
        why: 'This browser does not let an extension read the others, so nothing can be watched here.',
      }
    } else {
      state = {
        kind: 'ready',
        // The wire shape is deliberately loose (strings, not unions) so a newer
        // background cannot break an older page; it is narrowed here, once.
        changes: result.changes.map((change) => ({
          kind: change.kind as InventoryChange['kind'],
          id: change.id,
          name: change.name,
          detail: change.detail,
          severity: change.severity as InventoryChange['severity'],
        })),
        installed: result.installed,
        analysis: lastAnalysis,
        analysisNote:
          'No browser hands one extension another’s code, so nothing here can be analysed on its own. ' +
          'Choose a package you downloaded and it is read on this device — nothing is uploaded.',
      }
    }
  } catch (cause) {
    state = { kind: 'error', message: String(cause) }
  }

  const container = document.createElement('div')
  container.append(
    renderExtensions(document, state, {
      onDisable: (id: string) => {
        void (async () => {
          const result = await platform.runtime.send('extensions/disable', { id })
          if (result && !result.ok) window.alert(`Could not disable it: ${result.why ?? 'unknown reason'}`)
          await reload()
        })()
      },
      onTrust: (id: string) => {
        void (async () => {
          await platform.runtime.send('extensions/trust', { id })
          await reload()
        })()
      },
      onInspect: (file: File) => {
        void (async () => {
          try {
            // Read here, in the page, and analysed here. The file never reaches
            // the background, let alone the network.
            lastAnalysis = analysePackage(await file.text(), file.name)
          } catch (cause) {
            lastAnalysis = {
              findings: [],
              endpoints: [],
              minified: false,
              note: `That file could not be read: ${String(cause)}`,
            }
          }
          await reload()
        })()
      },
    }),
  )
  return container
}

async function paintCurrent(): Promise<void> {
  await paint(await load())
}

async function load(): Promise<PanelState> {
  try {
    const db = await openDb()
    const entries = await db.getAll('outbound_log')
    if (entries.length === 0) return { kind: 'empty' }
    return { kind: 'ready', entries, since: 'the last seven days' }
  } catch (cause) {
    return { kind: 'error', message: String(cause) }
  }
}

/** Full history is a request, not the default view. */
let fullHistory = false

async function journalSection(): Promise<HTMLElement> {
  let records: { entries: JournalRecord[]; lastCheck: string | null }
  try {
    records = await readJournal()
  } catch (cause) {
    const failed = document.createElement('section')
    failed.setAttribute('data-role', 'journal-error')
    failed.textContent = `The journal could not be read: ${String(cause)}`
    return failed
  }

  const { entries, unreadable } = mapJournal(records.entries)
  const since = fullHistory ? null : records.lastCheck
  return renderJournal(
    document,
    diffSince(entries, since, { unreadable }),
    { retentionDays: RETENTION_DAYS.journal },
    {
      onToggleHistory: () => {
        fullHistory = !fullHistory
        void reload()
      },
      onOpenEntry: () => {
        // Each entry already carries its sentence; there is no second screen to
        // open yet, and a dead control would be worse than none.
      },
    },
  )
}

async function readJournal(): Promise<{
  entries: JournalRecord[]
  lastCheck: string | null
}> {
  const db = await openDb()
  const entries = await db.getAll('journal')
  const setting = await db.get('settings', 'popup:lastCheck')
  return { entries, lastCheck: typeof setting?.value === 'string' ? setting.value : null }
}

/**
 * The recovery checklist appears when something sent the user here — the hash
 * carries which incident. Progress is kept in storage so closing the tab in the
 * middle of a bad afternoon does not lose it.
 */
async function recoverySection(): Promise<HTMLElement> {
  const kind = /#recovery=([^&]+)/.exec(location.hash)?.[1]
  const container = document.createElement('div')
  if (!kind) return container

  let progress: StepProgress[] = []
  try {
    const db = await openDb()
    const stored = await db.get('settings', `recovery:${kind}`)
    progress = typeof stored?.value === 'string' ? (JSON.parse(stored.value) as StepProgress[]) : []
  } catch {
    // Progress is a convenience; the checklist itself is the point.
  }

  container.append(
    renderRecovery(document, buildChecklist(decodeURIComponent(kind), progress), {
      onToggle: (stepId, done) => {
        void (async () => {
          const next = done
            ? [...progress.filter((entry) => entry.stepId !== stepId), { stepId, doneAt: new Date().toISOString() }]
            : progress.filter((entry) => entry.stepId !== stepId)
          try {
            const db = await openDb()
            await db.put('settings', { key: `recovery:${kind}`, value: JSON.stringify(next) })
          } catch {
            // Losing a tick is survivable; losing the checklist is not.
          }
          await reload()
        })()
      },
      onArchive: () => {
        void (async () => {
          const db = await openDb()
          await db.delete('settings', `recovery:${kind}`)
          location.hash = ''
          await reload()
        })()
      },
    }),
  )
  return container
}

async function paint(state: PanelState): Promise<void> {
  if (!root) return
  root.replaceChildren(
    renderSelfAudit(document, state, {
      onExport: () => void download(),
      onRepair: () => void reload(),
    }),
    await journalSection(),
    await recoverySection(),
    leaksSection(),
    await queueSection(),
    await extensionsSection(),
    renderDataControls(document, {
      onExport: download,
      onWipe: async () => {
        const db = await openDb()
        return wipeAll(db)
      },
      onWiped: () => void reload(),
    }),
  )
}

async function download(): Promise<void> {
  const db = await openDb()
  const json = await exportAll(db)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'okolos-export.json'
  link.click()
  URL.revokeObjectURL(url)
}

async function reload(): Promise<void> {
  await paint({ kind: 'loading' })
  await paint(await load())
}

void reload()
