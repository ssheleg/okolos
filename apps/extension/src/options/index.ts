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
  renderTrusted,
  type ExtensionsState,
  type TrustedDomain,
  renderLeaks,
  type LeaksState,
  renderJournal,
  renderRecovery,
  renderSelfAudit,
  type PanelState,
} from '@okolos/ui'
import { exportAll, openDb, RETENTION_DAYS, wipeAll, type JournalRecord } from '@okolos/storage'

import { mapJournal } from '../popup/state.js'
import { answered } from './answered.js'
import { keepingFocus } from './keep-focus.js'
import '../pages.css'

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

/**
 * The address field is built once and moved between repaints, never rebuilt.
 *
 * This page repaints wholesale — `root.replaceChildren` — and the sections
 * above it each await a database read, so a repaint takes real time while the
 * page is live. Rebuilding the input meant that anything typed during that
 * window was thrown away with the old node: the value, the caret, the focus,
 * and any composition an IME had in progress. Appending an element that is
 * already in the document moves it, so the live node and everything attached
 * to it survive the swap.
 *
 * It is also the difference between a working leak check and a button that
 * does nothing, which is how this was found: a check clicked while the page
 * was still settling read an empty address and returned in silence.
 */
const addressField = (() => {
  const field = document.createElement('input')
  field.type = 'email'
  field.setAttribute('data-role', 'address')
  field.placeholder = 'you@example.com'
  field.addEventListener('input', () => {
    address = field.value
  })
  return field
})()

function leaksSection(): HTMLElement {
  const container = document.createElement('div')
  // Named so the stylesheet can treat the field and the panel as one block.
  // Without it the address input floats between two cards, which is what the
  // first screenshot of the styled build showed.
  container.setAttribute('data-role', 'leaks-section')

  // The slot now lives inside the panel, where the field belongs: under the
  // description and above the button that reads it. The panel names the place;
  // this page fills it in `renderPanel`, synchronously after the swap, because
  // moving the live input into a tree that has not been swapped in yet takes it
  // out of the document for as long as the remaining sections take to load.
  container.append(
    renderLeaks(document, leaks, {
      onCheck: () => {
        void (async () => {
          // Silence was the old answer here, and it is the worst one: the
          // page looks exactly as it did before the press, so the user cannot
          // tell a refusal from a broken button — and neither could a test,
          // which is how a real defect stayed hidden behind a 15-second
          // timeout.
          if (!address.includes('@')) {
            leaks = {
              kind: 'idle',
              needs:
                address.trim() === ''
                  ? 'Enter the email address you want checked, then press Check now.'
                  : 'That does not look like an email address, so nothing was sent.',
            }
            await paintCurrent()
            return
          }
          leaks = { kind: 'checking' }
          await paintCurrent()
          try {
            const result = await platform.runtime.send('leaks/check', { address })
            leaks = result
              ? {
                  kind: 'ready',
                  inventory: { ...result, leaks: result.leaks },
                  now: new Date().toISOString(),
                }
              : { kind: 'error', message: 'the check returned nothing' }
          } catch (cause) {
            leaks = { kind: 'error', message: String(cause) }
          }
          await paintCurrent()
        })()
      },
      onChangePassword: (leak) => {
        // The well-known path is a published standard: a site that supports it
        // redirects to its real change-password page, and one that does not
        // lands the user on its own domain rather than on a guess of ours.
        if (leak.domain) void platform.tabs.create(`https://${leak.domain}/.well-known/change-password`)
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
        onResolve: (id: string) => {
          void (async () => {
            await platform.runtime.send('finding/resolve', { id })
            await reload()
          })()
        },
        onDefer: (id: string) => {
          void (async () => {
            const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            await platform.runtime.send('finding/defer', { id, until })
            await reload()
          })()
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

/**
 * SCR-12's trusted list. Trust is granted from a page in one click; this is the
 * only place it can be taken back, and the comparison view promises in those
 * words that it can be.
 */
async function trustedSection(): Promise<HTMLElement> {
  const container = document.createElement('div')
  let entries: TrustedDomain[] = []
  try {
    // Not `?? []`: silence is not an empty list, and the comment three lines
    // below has always said so.
    const result = answered(await platform.runtime.send('trust/list', {}), 'the trusted list')
    entries = result.entries.map((entry) => ({
      domain: entry.domain,
      grantedAt: entry.grantedAt,
      ...(entry.reason ? { reason: entry.reason } : {}),
    }))
  } catch (cause) {
    const failed = document.createElement('p')
    failed.setAttribute('data-role', 'trusted-error')
    // Never an empty list in place of a failure: it would read as "you trust
    // nothing", which is the reassuring answer and possibly the wrong one.
    failed.textContent = `The trusted list could not be read: ${String(cause)}`
    container.append(failed)
    return container
  }

  container.append(
    renderTrusted(document, entries, {
      onRevoke: (domain: string) => {
        void (async () => {
          await platform.runtime.send('trust/revoke', { domain })
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
      onCopy: (portableText: string) => {
        // A real click, and the page shows exactly what went to the clipboard.
        // The write can be refused; the text stays on screen either way.
        void navigator.clipboard?.writeText(portableText).catch(() => undefined)
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

/**
 * Repaints run one at a time, and a burst collapses to the last state.
 *
 * Each repaint awaits several database reads before it swaps the tree in, so
 * two started close together interleave: both build their sections, and
 * whichever finishes second wins the DOM. That alone loses whatever the first
 * one was about to show. With a long-lived node like the address field it is
 * worse — appending it to the second builder's container moves it out of the
 * first's, and if the first is the one that reaches `replaceChildren`, the
 * field is swapped in inside a container that no longer holds it and vanishes
 * from the page entirely.
 *
 * Serialising is the fix rather than a lock on the field, because the same
 * interleaving loses queue rows, journal entries and every other section for
 * exactly the same reason; the field is only where it was noticed.
 */
let painting: Promise<void> = Promise.resolve()
let pendingState: PanelState | null = null

function paint(state: PanelState): Promise<void> {
  pendingState = state
  const run = async (): Promise<void> => {
    const next = pendingState
    pendingState = null
    // Superseded while queued: a later call already carries the newer state,
    // and painting an older one on the way past would be a visible flicker
    // backwards.
    if (next !== null) await renderPanel(next)
  }
  // Both arms, not `.then(run)`. A chain built on the fulfilled arm alone
  // stops running the moment one paint rejects — a single failed database
  // read would leave the page frozen on whatever it last drew, for the rest
  // of the session, with no error and no way back.
  painting = painting.then(run, run)
  return painting
}

async function renderPanel(state: PanelState): Promise<void> {
  if (!root) return

  // Built first, swapped in second. Each of these awaits a database read, so
  // the tree below takes real time to assemble while the page is still live
  // and the user is still typing — and every section is constructed from
  // whatever the state was when its turn came.
  const sections = [
    renderSelfAudit(document, state, {
      onExport: () => void download(),
      onRepair: () => void reload(),
    }),
    await journalSection(),
    await recoverySection(),
    leaksSection(),
    await queueSection(),
    await extensionsSection(),
    await trustedSection(),
    renderDataControls(document, {
      onExport: download,
      onWipe: async () => {
        const db = await openDb()
        return wipeAll(db)
      },
      onWiped: () => void reload(),
    }),
  ]

  // Moving a node preserves its value. It does not preserve focus: removing an
  // element from the document blurs it, and native typing then goes nowhere —
  // the browser has no focused editable element to put it in. That is where a
  // whole address typed during the settle disappeared to, and why every
  // instrument aimed at it made the failure go away: each one added a round
  // trip that let the last repaint finish before the typing started.
  keepingFocus(addressField, () => {
    root.replaceChildren(...sections)
    // Synchronously, with no await between: the field is out of the document
    // for one statement rather than for the length of a database read.
    root.querySelector('[data-role=address-slot]')?.replaceWith(addressField)
  })

  revealSection()
}

/**
 * The section the hash asked for, brought into view.
 *
 * This page is long and everything on it is always rendered. Sending someone
 * here with `#queue` and leaving them at the top means the primary action of
 * the first run — "See what to do first" — opens a settings page. The section
 * was on it the whole time, four screens down.
 *
 * Focus moves too, not just the scroll: someone arriving by keyboard is at the
 * top of the document otherwise, and the scroll they cannot see did nothing
 * for them.
 */
const SECTION_FOR_HASH: Readonly<Record<string, string>> = {
  '#queue': '[data-role=queue-section]',
}

function revealSection(): void {
  const selector = SECTION_FOR_HASH[location.hash]
  if (selector === undefined) return

  const section = root?.querySelector<HTMLElement>(selector)
  if (!section) return

  section.setAttribute('tabindex', '-1')
  section.scrollIntoView({ block: 'start' })
  section.focus({ preventScroll: true })
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
