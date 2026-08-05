import { buildChecklist, type StepProgress } from '@okolos/core-recovery'
import { diffSince } from '@okolos/core-queue'
import { detectPlatform } from '@okolos/platform'
import {
  renderDataControls,
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
