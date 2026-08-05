import { mountBanner, type BannerHandle } from '@okolos/ui'
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

let banner: BannerHandle | null = null
let lastRescans: number[] = []
let pending: ReturnType<typeof setTimeout> | null = null

async function scan(): Promise<void> {
  const started = performance.now()
  const page = collect(document, {
    url: location.href,
    frameId: 0,
    budget: DEFAULT_BUDGET,
    elapsed: () => performance.now() - started,
  })

  if (page.candidates.length === 0) return

  const response = (await chrome.runtime.sendMessage({
    v: 1,
    type: 'page/candidates',
    payload: page,
  })) as { verdicts?: Verdict[] } | undefined

  const verdicts = response?.verdicts ?? []
  if (verdicts.length === 0) return

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
      onPrimary: () => void openInspector(verdict),
      onInspect: () => void openInspector(verdict),
      onDispute: () => {
        banner?.destroy()
        banner = null
      },
      onDismiss: () => {
        banner?.destroy()
        banner = null
      },
    },
  )
}

async function openInspector(verdict: Verdict): Promise<void> {
  // The inspector lands with M4; until then the evidence goes to the console
  // rather than pretending a panel exists.
  console.info('okolos: finding', verdict.evidence)
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
