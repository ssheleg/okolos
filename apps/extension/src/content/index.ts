import { checkLookalike, DEFAULT_WATCHLIST } from '@okolos/core-lookalike'
import { planSanitisation } from '@okolos/core-sanitizer'
import { detectPlatform } from '@okolos/platform'
import {
  mountBanner,
  mountGate,
  mountInspector,
  type BannerHandle,
  type GateHandle,
  type InspectorHandle,
} from '@okolos/ui'
import type {
  AgentAction,
  GateChoice,
  Severity,
  UnresolvedFinding,
  Verdict,
} from '@okolos/contracts'

import { AgentGate } from './agent-gate.js'
import { collect, DEFAULT_BUDGET } from './collect.js'
import { warnIfLookalike } from './lookalike.js'
import { watchCredentialFields } from './credential.js'
import { watchForTraps } from './traps.js'
import { Sanitiser } from './sanitize.js'

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

const sanitiser = new Sanitiser(document)

/**
 * How long a held action waits for a person. Long enough to read the modal and
 * look at the evidence; short enough that a page left open does not hold an
 * action forever. Running out blocks — never allows.
 */
const GATE_TIMEOUT_MS = 30_000

/**
 * What the gate treats as "the page is still compromised".
 *
 * A finding stops gating when the user has said the page is fine: dismissing
 * the banner or disputing the finding. Choosing to keep the text neutralised is
 * agreement that the page is hostile, so the gate stays on — as does restoring
 * the text, which puts the instruction back.
 */
let unresolved: UnresolvedFinding[] = []
/** Kept so the gate can open the evidence for the finding it is asking about. */
let lastVerdicts: Verdict[] = []

let banner: BannerHandle | null = null
let inspector: InspectorHandle | null = null
let gate: GateHandle | null = null
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

  // Neutralise in every frame, including the ones that never show a banner: an
  // injection inside an iframe is read by an assistant just as readily as one
  // in the top document.
  const neutralised = sanitiser.apply(planSanitisation(verdicts))

  // The gate arms in every frame too. An agent acting on an instruction it read
  // in an iframe submits that iframe's form, and the top frame never sees it.
  lastVerdicts = verdicts
  unresolved = verdicts.map((verdict) => ({ id: verdict.id, summary: summarise(verdict) }))

  if (!isTopFrame) return
  show(worst(verdicts), verdicts.length, page.truncated, neutralised)
}

function summarise(verdict: Verdict): string {
  const snippet = verdict.evidence.find((item) => item.snippet)?.snippet
  return snippet
    ? `Hidden text on this page addresses an assistant: "${snippet.slice(0, 120)}"`
    : 'This page carries hidden text written for an AI assistant.'
}

function worst(verdicts: readonly Verdict[]): Verdict {
  return [...verdicts].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity],
  )[0] as Verdict
}

function show(verdict: Verdict, total: number, partialScan: boolean, neutralised: number): void {
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
      detail:
        neutralised > 0
          ? `Hidden text is addressing an assistant rather than you${others}. It has been removed from the page, and you can put it back.${scanNote}`
          : `Hidden text is addressing an assistant rather than you${others}.${scanNote}`,
      sourceLine: `Found by: ${verdict.sources.map((s) => s.name).join(', ')}`,
    },
    {
      onPrimary: () => openInspector(verdict),
      onInspect: () => openInspector(verdict),
      onDispute: resolveEverything,
      onDismiss: () => {
        closeInspector()
        resolveEverything()
      },
    },
  )
}

/** The user has said this page is fine. The gate stands down with the banner. */
function resolveEverything(): void {
  unresolved = []
  banner?.destroy()
  banner = null
}

function openInspector(verdict: Verdict): void {
  inspector?.destroy()
  inspector = mountInspector(
    document,
    { evidence: verdict.evidence, confidence: verdict.confidence },
    {
      onKeep: closeInspector,
      onRestore: () => {
        sanitiser.restore()
        closeInspector()
      },
      onDispute: () => {
        closeInspector()
        resolveEverything()
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

/**
 * The gate is installed once, on every frame, and costs nothing until a finding
 * appears: with `unresolved` empty it returns on the first line of every click.
 */
new AgentGate({
  doc: document,
  unresolved: () => unresolved,
  ask: askTheUser,
  expiry: () =>
    new Promise((resolve) =>
      setTimeout(() => {
        // Take the surface down with the deadline. A modal left standing after
        // the action was already blocked is a page the user cannot use.
        closeGate()
        resolve()
      }, GATE_TIMEOUT_MS),
    ),
  journal: (decision) => {
    void platform.runtime.send('gate/decision', decision).catch(() => {
      // The journal is best-effort; the decision has already been enforced.
    })
  },
  newId: () => crypto.randomUUID(),
}).install()

function askTheUser(
  action: AgentAction,
  findings: readonly UnresolvedFinding[],
): Promise<GateChoice> {
  return new Promise((resolve) => {
    gate = mountGate(
      document,
      {
        action: action.description,
        ...(action.target === undefined ? {} : { target: action.target }),
        findings: findings.map((finding) => finding.summary),
        timeoutSeconds: GATE_TIMEOUT_MS / 1000,
      },
      {
        onBlock: () => {
          closeGate()
          resolve('block')
        },
        onAllowOnce: () => {
          closeGate()
          resolve('allow-once')
        },
        onShowInjection: () => {
          // The gate stays up behind the evidence: looking is not deciding.
          const verdict = lastVerdicts.find((item) => item.id === findings[0]?.id)
          if (verdict) openInspector(verdict)
        },
      },
    )
  })
}

function closeGate(): void {
  gate?.destroy()
  gate = null
}

/**
 * The address check runs once, before anything else and only in the top frame:
 * it is about the page the user believes they are on, and a subframe is not
 * that page.
 */
if (isTopFrame) {
  void warnIfLookalike({
    doc: document,
    hostname: () => location.hostname,
    trusted: async () => (await platform.runtime.send('trust/list', {}))?.domains ?? [],
    trust: async (host) => {
      await platform.runtime.send('trust/add', { domain: host })
    },
    leave: () => history.back(),
  }).catch(() => {
    // An address that could not be checked is not an address declared safe;
    // nothing is shown either way, and the page is left alone.
  })
}

/**
 * Trap watching runs only in the top frame and only where a person is looking:
 * a ClickFix banner inside a hidden ad frame warns nobody, and the fullscreen it
 * would try to leave is not the fullscreen the user is trapped in.
 */
if (isTopFrame) {
  watchForTraps({
    doc: document,
    text: () => document.body?.innerText ?? '',
    leave: () => history.back(),
    recover: (kind) => {
      void platform.runtime.send('recovery/open', { kind }).catch(() => undefined)
    },
    warned: (kind, signals) => {
      void platform.runtime
        .send('trap/warned', { kind, signals: signals.join(',') })
        .catch(() => undefined)
    },
    exitFullscreen: () => {
      void document.exitFullscreen?.().catch(() => {
        // The browser refused. The warning still stands and still says the way
        // out is to close the tab.
      })
    },
  })
}

/**
 * The password pause, top frame only: a login form in a subframe is warned
 * about by the frame it is in, and two banners for one field is one too many.
 */
if (isTopFrame) {
  watchCredentialFields({
    doc: document,
    host: () => location.hostname,
    now: () => new Date().toISOString(),
    facts: async (host) => {
      const known = await platform.runtime.send('site/facts', { host })
      const trusted = (await platform.runtime.send('trust/list', {}))?.domains ?? []
      return {
        trusted: known?.trusted ?? trusted.includes(host),
        firstSeen: known?.firstSeen ?? null,
        secure: location.protocol === 'https:',
        postsTo: null,
        resembles: checkLookalike(host, [...DEFAULT_WATCHLIST, ...trusted])?.resembles ?? null,
      }
    },
    trust: async (host) => {
      await platform.runtime.send('trust/add', { domain: host })
    },
    leave: () => history.back(),
  })
}

/**
 * The password check runs on submit, on the digest, never on the password.
 *
 * SHA-1 is computed here in the page's own context; what crosses into the
 * extension is forty hex characters, and what leaves the device is the first
 * five of them. The check is deliberately after submission: warning someone
 * before they have finished typing interrupts a login they were going to
 * complete anyway.
 */
if (isTopFrame) {
  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target
      if (!(form instanceof HTMLFormElement)) return
      const field = form.querySelector<HTMLInputElement>('input[type=password]')
      const value = field?.value
      if (!value) return

      void (async () => {
        try {
          const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value))
          const sha1 = [...new Uint8Array(digest)]
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase()

          const verdict = await platform.runtime.send('password/check', { sha1 })
          if (!verdict?.compromised) return

          mountBanner(
            document,
            {
              variant: 'password',
              severity: 'major',
              headline: 'This password has appeared in a breach',
              detail: verdict.explain,
              sourceLine: verdict.offline
                ? 'Found by: a list built into this extension — nothing was sent'
                : 'Found by: Have I Been Pwned (CC BY 4.0), via a range query that sent five characters of the fingerprint',
            },
            {
              onPrimary: () => undefined,
              onInspect: () => undefined,
              onDispute: () => undefined,
              onDismiss: () => undefined,
            },
          )
        } catch {
          // A failed check is not a clean password, and it is not a broken
          // login either: the submission has already gone through.
        }
      })()
    },
    true,
  )
}

void safely(scan)
new MutationObserver(rescanSoon).observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
})
