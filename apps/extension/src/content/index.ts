import { sha1Hex } from '@okolos/core-credential'
import { checkLookalike, DEFAULT_WATCHLIST } from '@okolos/core-lookalike'
import { planSanitisation } from '@okolos/core-sanitizer'
import { t, useResolver } from '@okolos/i18n'
import { detectPlatform } from '@okolos/platform'
import {
  mountBanner,
  mountGate,
  mountInspector,
  type BannerHandle,
  type GateHandle,
  type InspectorHandle,
} from '@okolos/ui'
import { worstOf } from '@okolos/contracts'
import type {
  AgentAction,
  GateChoice,
  UnresolvedFinding,
  Verdict,
} from '@okolos/contracts'

import { AgentGate } from './agent-gate.js'
import { createPacer } from './pace.js'
import { reportToEmbeddingPage } from './report-frame.js'
import { collect, DEFAULT_BUDGET } from './collect.js'
import { warnIfLookalike } from './lookalike.js'
import { watchCredentialFields } from './credential.js'
import { showDownloadVerdict } from './download.js'
import { watchForTraps } from './traps.js'
import { Sanitiser } from './sanitize.js'

/**
 * The content script: collect, ask the background for a verdict, warn.
 *
 * Everything here is wrapped so that a failure is silent to the page. A
 * security extension that throws inside someone's checkout is worse than one
 * that misses a finding, so every path fails open.
 */



const platform = detectPlatform()

/**
 * Before anything mounts.
 *
 * The three in-page surfaces ask the catalogue for every word they show. This
 * line is the whole reason they get words rather than `[bannerActionInjection]`
 * — and it was missing for one commit, which the browser caught and no unit
 * test could: the unit tests install a resolver themselves, so the surfaces
 * spoke Russian in the suite and identifiers on a real page.
 *
 * `tools/entry-resolver.test.ts` now fails the build when an entry point that
 * reaches `t()` does not install one.
 */
useResolver((key, substitutions) => platform.message(key, substitutions))

/**
 * Only the top frame shows a warning.
 *
 * The script runs in every frame because injections hide in iframes too, but a
 * banner mounted inside a subframe can be invisible, clipped, or duplicated
 * across a dozen ad frames. Subframes still collect and report; the top frame
 * is the one that speaks.
 *
 * **The reporting half was missing until 2026-08-20**, and this comment described
 * it anyway: the subframe neutralised, armed the gate and returned on
 * `if (!isTopFrame)`, so a poisoned iframe was handled and never mentioned. The
 * report now goes frame → background → top frame, and through the background on
 * purpose — a subframe could reach the top with `window.top.postMessage`, and that
 * message travels through the page's own window, where the page can forge it and
 * the top frame cannot tell an extension's report from a claim by the thing being
 * reported. See SCN-031.
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
/**
 * Findings on this page the user has not handled — `null` until the page has been
 * read at all.
 *
 * `[]` and "not asked yet" used to be the same value, and the gate read the
 * second as the first: between `document_idle` and the verdict returning it
 * answered "nothing unresolved here", which is an unrun check reported as a
 * passed one. The window is short and it is the window a page controls — it can
 * fire its scripted click on the first line of its own body.
 */
let unresolved: UnresolvedFinding[] | null = null

/**
 * Sixteen random hex characters, from an API that exists on an insecure page.
 *
 * `crypto.randomUUID` is `[SecureContext]`; `crypto.getRandomValues` is not.
 * That difference was a total fail-open on every `http://` page, because the id
 * was taken before the action was held.
 */
function randomId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}
/** Kept so the gate can open the evidence for the finding it is asking about. */
let lastVerdicts: Verdict[] = []

let banner: BannerHandle | null = null
let inspector: InspectorHandle | null = null
let gate: GateHandle | null = null


/**
 * Performance marks are local to the page and never leave it. They exist so
 * the budget can be measured where it actually matters — in a real browser on
 * a real page — instead of being asserted against a synthetic DOM that has no
 * layout engine behind it.
 */
const MARK_START = 'okolos:collect:start'
const MARK_END = 'okolos:collect:end'
export const MEASURE_COLLECT = 'okolos:collect'

/**
 * The bridge to the MAIN-world watcher.
 *
 * It is armed only while this page carries a finding nobody has dealt with, so
 * an ordinary page pays nothing and no request anywhere is recorded without a
 * reason. The channel is `window.postMessage`, which the page can post on too:
 * a hostile page can therefore add entries that never happened. It cannot
 * remove the real ones, and a forged journal line costs noise rather than
 * silence — which is the right way round for a record.
 */
/**
 * Arms the watcher, and has no way to disarm it.
 *
 * There used to be a `disarm` on the same channel, and the watcher accepted it
 * from `event.source === window` — which the page's own `postMessage` satisfies.
 * One line of page script bought silence for the rest of the page's life, in the
 * one mechanism whose whole value is that a record exists. Arming stayed
 * forgeable and that is fine: ADR-0009 says the cost of a forged line is noise.
 *
 * Turning the watch off is now the background's business, where the page has no
 * vote: a report for an origin with no unresolved finding is dropped before
 * anything is written.
 */
function armPageWatch(on: boolean): void {
  if (!on) return
  try {
    window.postMessage({ source: 'okolos:page-watch:arm' }, '*')
  } catch {
    // The watcher stays as it was. It observes; nothing depends on it.
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const data = event.data as { source?: unknown; method?: unknown; host?: unknown } | null
  if (data?.source !== 'okolos:page-watch:report') return
  if (typeof data.method !== 'string' || typeof data.host !== 'string') return
  void safely(async () => {
    await platform.runtime.send('page/request', { method: data.method as string, host: data.host as string })
  })
})

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
  // Assigned even when empty: this is the moment "not asked yet" becomes "asked,
  // and there is nothing", and those are different answers to the gate.
  unresolved = verdicts.map((verdict) => ({ id: verdict.id, summary: summarise(verdict) }))
  armPageWatch(unresolved.length > 0)

  if (!isTopFrame) {
    void tellEmbeddingPage(verdicts)
    return
  }
  show(worst(verdicts), verdicts.length, page.truncated, neutralised)
}

/**
 * The frame's obligation, wired to the policy that lives in `report-frame.ts`.
 *
 * The policy is a separate module for the reason the pacer is: how many times and how
 * far apart is a decision, and one nobody can call in a test is one nobody has checked.
 */
async function tellEmbeddingPage(verdicts: readonly Verdict[]): Promise<void> {
  await reportToEmbeddingPage(
    { origin: '', summary: summarise(worst(verdicts)).slice(0, 160), count: verdicts.length },
    {
      relay: (report) => platform.runtime.send('frame/report', report),
      giveUp: async ({ attempts, seconds }) => {
        // Worded here, counted there: the note is dumped verbatim into the export
        // the user downloads, so it goes through the catalogue like any other
        // sentence they will read.
        await platform.runtime.send('page/note', {
          kind: 'frame-unreported',
          explain: t('frameUnreported', String(attempts), String(seconds)),
        })
      },
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
  )
}

function summarise(verdict: Verdict): string {
  const snippet = verdict.evidence.find((item) => item.snippet)?.snippet
  return snippet
    ? `Hidden text on this page addresses an assistant: "${snippet.slice(0, 120)}"`
    : t('contentHiddenText')
}

function worst(verdicts: readonly Verdict[]): Verdict {
  // `worstOf` from the contract, not a local copy of the order: the background
  // needs the same ranking to name the worst finding in an embedded frame, and two
  // copies of four numbers agree with each other rather than with anything else.
  return worstOf(verdicts) as Verdict
}

/**
 * The warning for a finding the top frame never saw.
 *
 * Named by origin, because "something on this page" and "something in the frame
 * from ads.example" are different warnings and only the second one tells the reader
 * where to look. An empty origin — a `srcdoc` or `about:blank` frame, whose address
 * is not the frame's own — says "an embedded frame" instead of pretending to a name.
 */
function showFrameFinding(finding: { origin: string; summary: string; count: number }): void {
  const where = finding.origin === '' ? t('warnFrameUnnamed') : finding.origin
  const more = finding.count > 1 ? t('warnFrameMore', String(finding.count - 1)) : ''

  banner = mountBanner(
    document,
    {
      variant: 'injection',
      severity: 'major',
      headline: t('warnFrameHeadline', where),
      detail: t('warnFramePlain', finding.summary, more),
      sourceLine: t('warnFrameSource'),
      primaryLabel: t('warnFrameJournal'),
    },
    {
      onPrimary: openFrameJournal,
      onRetry: openFrameJournal,
      onDispute: resolveEverything,
      onDismiss: resolveEverything,
    },
  )
}

function openFrameJournal(): void {
  void platform.runtime.send('recovery/open', { kind: 'journal' }).catch(() => undefined)
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
      headline: t('warnInjectionHeadline'),
      detail:
        neutralised > 0
          ? t('warnInjectionNeutralised', others, scanNote)
          : t('warnInjectionPlain', others, scanNote),
      sourceLine: t('warnFoundBy', verdict.sources.map((s) => s.name).join(', ')),
    },
    {
      onPrimary: () => openInspector(verdict),
      onRetry: () => openInspector(verdict),
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
  armPageWatch(false)
  banner?.destroy()
  banner = null
}

/**
 * Turns a restore's outcome into a sentence, or null when it finished.
 *
 * Two ways the page moves underneath one, and they read differently to the
 * person holding the button: the element left the page, or the page wrote its
 * own content into it. Neither is a failure of the product, and both are worth
 * saying out loud.
 */
function explainRestore(outcome: { restored: number; gone: number; changed: number }): string {
  const parts: string[] = []
  if (outcome.gone > 0) {
    parts.push(
      `${outcome.gone} ${outcome.gone === 1 ? 'passage was' : 'passages were'} not put back: the page had already removed ${outcome.gone === 1 ? 'it' : 'them'}`,
    )
  }
  if (outcome.changed > 0) {
    parts.push(
      `${outcome.changed} ${outcome.changed === 1 ? 'was' : 'were'} left alone: the page has written its own content there since, and adding the hidden text back beside it would put the instruction into the page again`,
    )
  }
  const restored =
    outcome.restored > 0 ? `${outcome.restored} restored. ` : t('contentNothingRestored')
  return `${restored}${parts.join('; ')}.`
}

function openInspector(verdict: Verdict, restoreNote?: string): void {
  inspector?.destroy()
  inspector = mountInspector(
    document,
    {
      evidence: verdict.evidence,
      confidence: verdict.confidence,
      ...(restoreNote ? { restoreNote } : {}),
    },
    {
      onKeep: closeInspector,
      onRestore: () => {
        const outcome = sanitiser.restore()
        const unfinished = outcome.gone + outcome.changed
        if (unfinished === 0) {
          closeInspector()
          return
        }

        // Not a dismissal. The panel stays with a sentence saying what could
        // not be put back, because closing on a restore that did not happen is
        // how the user learns the button does nothing.
        const note = explainRestore(outcome)
        openInspector(verdict, note)
        void platform.runtime
          .send('page/note', { kind: 'restore', explain: note })
          .catch(() => undefined)
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

/**
 * The pace at which a mutating page is re-read.
 *
 * The policy lives in `pace.ts` and is tested there. What it replaced held the
 * same three numbers in module variables and *dropped* an over-budget scan,
 * which meant a page that mutated hard and then went quiet was never examined
 * in its final state.
 */
const pacer = createPacer({
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle),
  run: () => void safely(scan),
})

function rescanSoon(): void {
  pacer.request()
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
  /**
   * An action that went through before this page had been read.
   *
   * Not held: holding every click on every page for the length of a scan is how
   * an extension becomes the thing that broke the web. Recorded, because the
   * third option — passing silently, as though the page had been read and found
   * clean — is the one ADR-0004 forbids.
   */
  noteUnread: (action) => {
    void platform.runtime
      .send('page/note', {
        kind: 'gate-unread',
        explain: t('logGateUnread', action.description),
      })
      .catch(() => undefined)
  },
  // Read at the moment of the action, not once at load: a page cannot change
  // this, but reading it late costs nothing and keeps the fact current.
  automated: () => navigator.webdriver === true,
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
  /**
   * An id that exists on an insecure page too.
   *
   * `crypto.randomUUID` is `[SecureContext]` and the manifest matches
   * plain-HTTP pages, so this used to throw `TypeError` on every plain-HTTP page —
   * inside `#describe`, before `preventDefault`, which meant the gate let the
   * action through on exactly the pages a poisoned document is cheapest to serve
   * from. `getRandomValues` carries no such restriction.
   */
  newId: () => randomId(),
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
 * What the banner says about reuse, and the distinction it must not blur.
 *
 * "Not seen anywhere else" and "never seen at all" are different sentences.
 * A fresh install knows nothing, and a panel that reads its own emptiness as
 * reassurance is the reason the "Check reuse" control was removed for two
 * releases rather than left answering from a store that did not exist.
 */
function reuseLine(verdict: { reusedOn: string[]; reuseUnknown: boolean }): string {
  if (verdict.reuseUnknown) return t('warnPasswordReuseUnknown')
  if (verdict.reusedOn.length === 0) return t('warnPasswordReuseNone')
  return t('warnPasswordReuse', String(verdict.reusedOn.length), verdict.reusedOn.join(', '))
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
          /**
           * Our own SHA-1, not the platform's.
           *
           * `crypto.subtle` is `[SecureContext]` and the manifest matches
           * plain-HTTP pages, so on any of them this line used to throw and the
           * `catch` below swallowed it: **the breach and reuse check did not run
           * at all**, on exactly the pages where a password sent in the clear
           * matters most. Nobody learned, because the catch says nothing.
           * Measured 2026-08-20 by scanning the shipped bundle for
           * secure-context APIs, which is now a gate.
           *
           * `packages/core-credential/src/sha1.ts` is checked against the
           * standard vectors *and* against the platform's own digest, so
           * "identical answer, one fewer requirement" is a test rather than a
           * hope.
           */
          const sha1 = sha1Hex(value)

          // The host travels with the digest: it is what makes "where else do I use
          // this" answerable, and it is already the address of the page the user
          // is looking at.
          const verdict = await platform.runtime.send('password/check', {
            sha1,
            host: location.host,
          })
          if (!verdict?.compromised) return

          mountBanner(
            document,
            {
              variant: 'password',
              severity: 'major',
              headline: t('warnPasswordHeadline'),
              // The reuse line is appended rather than replacing the verdict:
              // "this password is in a breach" and "you use it in four places"
              // are two facts, and the second is what turns the first into
              // something to do this evening.
              detail: `${verdict.explain} ${reuseLine(verdict)}`,
              sourceLine: t(
                'warnFoundBy',
                verdict.offline ? t('warnPasswordSourceOffline') : t('warnPasswordSourceOnline'),
              ),
            },
            {
              onPrimary: () => undefined,
              onRetry: () => undefined,
              onDispute: () => undefined,
              onDismiss: () => undefined,
            },
          )
        } catch (cause) {
          /**
           * A failed check is not a clean password, and it is not a broken login
           * either: the submission has already gone through. What it must not be
           * is invisible — a check that did not run and a check that passed
           * looked identical from here, for every password on every http page.
           */
          void platform.runtime
            .send('page/note', {
              kind: 'password-unchecked',
              explain: t('logPasswordUnchecked', String(cause)),
            })
            .catch(() => undefined)
        }
      })()
    },
    true,
  )
}

/**
 * The worker judges a download and has nowhere to say so; this is where it is
 * said. Top frame only — a banner about a file belongs on the page the person
 * is looking at, not in whatever advertisement frame happens to be listening.
 */
if (isTopFrame) {
  platform.runtime.onMessage((message) => {
    if (message.type === 'download/verdict') {
      showDownloadVerdict(message.payload as never, {
        doc: document,
        openJournal: () => {
          void platform.runtime.send('recovery/open', { kind: 'journal' }).catch(() => undefined)
        },
      })
      return Promise.resolve({ ok: true }) as never
    }

    /**
     * A finding in an embedded frame, reported by the background because the frame
     * cannot report it itself without going through the page's own window — where
     * the page could forge it.
     *
     * **Recorded limit:** if this page already has a banner up for its own finding,
     * the frame's is left to the journal rather than drawn as a second overlay. Two
     * warnings stacked on one page is how a warning stops being read, and folding
     * the count in would need the top frame to know about frames it cannot see. The
     * common case — a clean page embedding a poisoned frame — is the one that had no
     * warning at all until now.
     */
    if (message.type === 'frame/finding') {
      const finding = message.payload as { origin: string; summary: string; count: number }
      if (!banner) showFrameFinding(finding)
      return Promise.resolve({ ok: true }) as never
    }

    return undefined
  })
}

void safely(scan)
new MutationObserver(rescanSoon).observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
})
