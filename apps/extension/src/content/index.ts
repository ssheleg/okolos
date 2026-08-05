import { detectPlatform } from '@okolos/platform'
import { mountBanner, mountInspector, type BannerHandle, type InspectorHandle } from '@okolos/ui'
import type { Severity, Verdict } from '@okolos/contracts'

import { collect, DEFAULT_BUDGET } from './collect.js'

/**
 * The content script: collect, ask the background for a verdict, warn.
 *
 * Everything here is wrapped so that a failure is silent to the page. A
 * security extension that throws inside someone's checkout is worse than one
 * that misses a finding, so every path fails open.
 */

const SEVERITY_ORDER: Record<Severity, number> = { critical: 3, major: 2, minor: 1, info: 0 }
const RESCAN_DEBOUNCE_MS = 250
const MAX_RESCANS_PER_SECOND = 2

const platform = detectPlatform()

/**
 * Only the top frame shows a warning.
 *
 * The script runs in every frame because injections hide in iframes too, but a
 * banner mounted inside a subframe can be invisible, clipped, or duplicated
 * across a dozen ad frames. Subframes still collect and report; the top frame
 * is the one that speaks.
 */
const isTopFrame = window.top === window

let banner: BannerHandle | null = null
let inspector: InspectorHandle | null = null
let lastRescans: number[] = []
let pending: ReturnType<typeof setTimeout> | null = null

/**
 * Performance marks are local to the page and never leave it. They exist so
 * the budget can be measured where it actually matters — in a real browser on
 * a real page — instead of being asserted against a synthetic DOM that has no
 * layout engine behind it.
 */
const MARK_START = 'okolos:collect:start'
const MARK_END = 'okolos:collect:end'
export const MEASURE_COLLECT = 'okolos:collect'

async function scan(): Promise<void> {
  const started = performance.now()
  performance.mark(MARK_START)
  const page = collect(document, {
    url: location.href,
    frameId: isTopFrame ? 0 : 1,
    budget: DEFAULT_BUDGET,
    elapsed: () => performance.now() - started,
  })
  performance.mark(MARK_END)
  performance.measure(MEASURE_COLLECT, MARK_START, MARK_END)

  if (page.candidates.length === 0) return

  // Through the platform adapter, not chrome.runtime directly: Firefox's
  // `chrome` namespace is callback-based, so awaiting it there returns
  // undefined and the verdict is silently lost. The bug would have been
  // invisible in Chrome and total in Firefox.
  const response = await platform.runtime.send('page/candidates', page)

  const verdicts: Verdict[] = response?.verdicts ?? []
  if (verdicts.length === 0) return
  if (!isTopFrame) return

  show(worst(verdicts), verdicts.length, page.truncated)
}

function worst(verdicts: readonly Verdict[]): Verdict {
  return [...verdicts].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity],
  )[0] as Verdict
}

function show(verdict: Verdict, total: number, partialScan: boolean): void {
  banner?.destroy()

  const others = total > 1 ? ` and ${total - 1} more on this page` : ''
  const scanNote = partialScan
    ? ' This page was too large to check in full, so there may be more.'
    : ''

  banner = mountBanner(
    document,
    {
      variant: 'injection',
      severity: verdict.severity,
      headline: 'This page carries instructions written for an AI assistant',
      detail: `Hidden text is addressing an assistant rather than you${others}.${scanNote}`,
      sourceLine: `Found by: ${verdict.sources.map((s) => s.name).join(', ')}`,
    },
    {
      onPrimary: () => openInspector(verdict),
      onInspect: () => openInspector(verdict),
      onDispute: () => {
        banner?.destroy()
        banner = null
      },
      onDismiss: () => {
        closeInspector()
        banner?.destroy()
        banner = null
      },
    },
  )
}

function openInspector(verdict: Verdict): void {
  inspector?.destroy()
  inspector = mountInspector(
    document,
    { evidence: verdict.evidence, confidence: verdict.confidence },
    {
      onKeep: closeInspector,
      onRestore: () => {
        // Restoring the page is the sanitizer's job and lands with M5. Until it
        // exists, saying so beats a button that quietly does nothing.
        console.info('okolos: restore arrives with the sanitizer (M5)')
        closeInspector()
      },
      onDispute: () => {
        closeInspector()
        banner?.destroy()
        banner = null
      },
      onClose: closeInspector,
    },
  )
}

function closeInspector(): void {
  inspector?.destroy()
  inspector = null
}

function rescanSoon(): void {
  if (pending) return
  pending = setTimeout(() => {
    pending = null
    const now = Date.now()
    lastRescans = lastRescans.filter((t) => now - t < 1000)
    if (lastRescans.length >= MAX_RESCANS_PER_SECOND) return
    lastRescans.push(now)
    void safely(scan)
  }, RESCAN_DEBOUNCE_MS)
}

async function safely(work: () => Promise<void>): Promise<void> {
  try {
    await work()
  } catch (cause) {
    // Fail open, always: a detector fault must never break the page a person
    // is trying to use.
    console.warn('okolos: scan failed', cause)
  }
}

void safely(scan)
new MutationObserver(rescanSoon).observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
})
