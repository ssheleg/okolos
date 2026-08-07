import { detectPlatform } from '@okolos/platform'
import { openDb } from '@okolos/storage'
import { renderPopup, type PopupState } from '@okolos/ui'

import { buildPopupState } from './state.js'
import '../pages.css'

/**
 * The popup: is this page fine, and is anything waiting for me.
 *
 * Every read is wrapped, and a failed read becomes a stated failure rather than
 * a clean verdict. The one thing this surface must never do is answer "nothing
 * needs you" when it does not know.
 */

const LAST_CHECK_KEY = 'popup:lastCheck'

const platform = detectPlatform()
const root = document.getElementById('root')

let expanded = false

async function load(): Promise<PopupState> {
  try {
    const db = await openDb()
    const [findings, journal, setting, settings, activeUrl] = await Promise.all([
      db.getAll('findings'),
      db.getAll('journal'),
      db.get('settings', LAST_CHECK_KEY),
      db.getAll('settings'),
      platform.tabs.activeUrl().catch(() => null),
    ])

    const deferrals = new Map(
      settings
        .filter((row) => row.key.startsWith('defer:') && typeof row.value === 'string')
        .map((row) => [row.key.slice('defer:'.length), row.value as string]),
    )

    return buildPopupState({
      findings,
      journal,
      activeUrl,
      lastCheck: typeof setting?.value === 'string' ? setting.value : null,
      expanded,
      deferrals,
      now: new Date().toISOString(),
    })
  } catch (cause) {
    return { kind: 'error', message: String(cause) }
  }
}

function paint(state: PopupState): void {
  if (!root) return
  root.replaceChildren(
    renderPopup(document, state, {
      onAct: (itemId) => void openFinding(itemId),
      onResolve: (itemId) => {
        void (async () => {
          await platform.runtime.send('finding/resolve', { id: itemId })
          await reload()
        })()
      },
      onDefer: (itemId) => {
        void (async () => {
          // Tomorrow, not forever: "not now" that never comes back is the same
          // as dismissing, and the user did not say that.
          const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          await platform.runtime.send('finding/defer', { id: itemId, until })
          await reload()
        })()
      },
      onShowAll: () => {
        expanded = true
        void reload()
      },
      onWhatChanged: () => void openPage('options.html#journal'),
      onOpen: (target) =>
        void openPage(target === 'journal' ? 'options.html#journal' : 'options.html'),
      onRepair: () => void reload(),
    }),
  )
}

async function reload(): Promise<void> {
  paint({ kind: 'loading' })
  paint(await load())
}

async function openFinding(itemId: string): Promise<void> {
  try {
    const db = await openDb()
    const finding = await db.get('findings', itemId)
    const url = finding?.verdict?.subject.ref
    if (url) await platform.tabs.create(url)
  } catch {
    // The action failed and the popup is about to close, so there is nowhere
    // left to say so. Better than throwing inside a click handler.
  }
}

async function openPage(page: string): Promise<void> {
  await platform.tabs.create(platform.runtime.getUrl(page))
}

/**
 * The check time is written when the popup goes away, not when it opens —
 * otherwise "what changed since last time" would be empty the moment you looked
 * at it. `pagehide` is the event a closing popup actually fires.
 */
window.addEventListener('pagehide', () => {
  void (async () => {
    try {
      const db = await openDb()
      await db.put('settings', { key: LAST_CHECK_KEY, value: new Date().toISOString() })
    } catch {
      // Losing the baseline means the next diff is wider than it should be,
      // which errs towards showing too much — the safe direction.
    }
  })()
})

void reload()
