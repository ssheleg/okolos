import { detectClickFix, detectTechSupport } from '@okolos/core-traps'
import { mountBanner, type BannerHandle } from '@okolos/ui'

/**
 * Watching for the two traps that work on the person rather than the browser.
 *
 * Both warnings interrupt, which nothing else here does. That is deliberate:
 * the user is mid-way into the trap and one action from harm — a paste into a
 * run box, a phone call — and an advisory banner they can scroll past is not a
 * warning at that moment.
 *
 * Both are also honest about their reach. A copy made through
 * `navigator.clipboard` in the page's own world is invisible from here, and so
 * are the dialogs a tech-support page loops; what this sees is the `copy` event
 * the browser dispatches, the fullscreen it can leave, and the page's wording.
 * Where it cannot see, it says so instead of implying it handled it.
 */

export interface TrapDeps {
  readonly doc: Document
  text(): string
  leave(): void
  recover(kind: 'clickfix' | 'techsupport'): void
  exitFullscreen(): void
  /** Called once when a warning is raised, with what it rests on. */
  warned?: (kind: 'clickfix' | 'techsupport', signals: readonly string[]) => void
}

export interface TrapWatcher {
  stop(): void
}

const RECHECK_MS = 400

export function watchForTraps(deps: TrapDeps): TrapWatcher {
  let banner: BannerHandle | null = null
  let scriptedCopy = false
  let copied: string | null = null
  let forcedFullscreen = false
  let dialogLoop = false
  let lastGesture = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const gesture = () => {
    lastGesture = Date.now()
  }
  const recently = () => Date.now() - lastGesture < 1000

  const onCopy = (event: Event) => {
    if (event.isTrusted) return
    scriptedCopy = true
    try {
      copied = (event as ClipboardEvent).clipboardData?.getData('text/plain') ?? null
    } catch {
      // Reading the clipboard through the event is best-effort. The warning
      // stands on the write itself; it just cannot show the payload.
      copied = null
    }
    schedule()
  }

  const onFullscreen = () => {
    if (!deps.doc.fullscreenElement) return
    if (recently()) return
    // Nobody asked for this. Leaving is the first thing to do, before any text
    // is read: the user has lost control of their window.
    forcedFullscreen = true
    deps.exitFullscreen()
    schedule()
  }

  const onBeforeUnload = () => {
    dialogLoop = true
  }

  function schedule(): void {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      check()
    }, RECHECK_MS)
  }

  function check(): void {
    if (banner) return
    const text = deps.text()

    const clickfix = detectClickFix({ text, scriptedCopy, copied })
    if (clickfix) {
      banner = mountBanner(
        deps.doc,
        {
          variant: 'clickfix',
          severity: 'critical',
          // Two different claims, and the difference is not cosmetic: before
          // anything is on the clipboard, saying it was copied is untrue.
          headline:
            clickfix.confidence === 'high'
              ? 'This page copied a command for you to run'
              : 'This page wants you to run a command outside the browser',
          detail: [
            'A real verification never asks you to leave the browser and run something.',
            clickfix.confidence === 'high'
              ? clickfix.copyUnreadable
                ? 'What was copied could not be read, so it is not shown.'
                : `It copied: ${clickfix.copied ?? ''}`
              : 'Nothing has been copied yet.',
          ].join(' '),
          sourceLine: `Found by: ${clickfix.signals.join(', ')}`,
        },
        {
          onPrimary: deps.leave,
          onInspect: () => deps.recover('clickfix'),
          onDispute: dismiss,
          onDismiss: dismiss,
        },
      )
      deps.warned?.('clickfix', clickfix.signals)
      return
    }

    const techsupport = detectTechSupport({ text, forcedFullscreen, dialogLoop })
    if (techsupport) {
      banner = mountBanner(
        deps.doc,
        {
          variant: 'techsupport',
          severity: 'critical',
          headline: 'The warning on this page is fake',
          detail: [
            'No company is watching your computer, and nothing here has detected a virus.',
            techsupport.phone ? `The number shown, ${techsupport.phone}, reaches the people who made this page.` : '',
            techsupport.dialogsUnsuppressed
              ? 'This page keeps raising dialogs that cannot be stopped from here — closing the tab is the way out.'
              : '',
          ]
            .filter(Boolean)
            .join(' '),
          sourceLine: `Found by: ${techsupport.signals.join(', ')}`,
        },
        {
          onPrimary: deps.leave,
          onInspect: () => deps.recover('techsupport'),
          onDispute: dismiss,
          onDismiss: dismiss,
        },
      )
      deps.warned?.('techsupport', techsupport.signals)
    }
  }

  function dismiss(): void {
    banner?.destroy()
    banner = null
  }

  for (const type of ['pointerdown', 'keydown']) {
    deps.doc.addEventListener(type, gesture, true)
  }
  deps.doc.addEventListener('copy', onCopy, true)
  deps.doc.addEventListener('fullscreenchange', onFullscreen, true)
  deps.doc.defaultView?.addEventListener('beforeunload', onBeforeUnload)

  // The page's wording is enough on its own for the tech-support case, so one
  // pass runs without waiting for an event that may never come.
  schedule()

  return {
    stop() {
      if (timer) clearTimeout(timer)
      for (const type of ['pointerdown', 'keydown']) {
        deps.doc.removeEventListener(type, gesture, true)
      }
      deps.doc.removeEventListener('copy', onCopy, true)
      deps.doc.removeEventListener('fullscreenchange', onFullscreen, true)
      deps.doc.defaultView?.removeEventListener('beforeunload', onBeforeUnload)
      dismiss()
    },
  }
}
