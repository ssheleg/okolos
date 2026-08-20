import { sha1Hex } from '@okolos/core-credential'
import { checkLookalike, DEFAULT_WATCHLIST } from '@okolos/core-lookalike'
import { planSanitisation } from '@okolos/core-sanitizer'
import { t, useResolver } from '@okolos/i18n'
import { detectPlatform } from '@okolos/platform'
import {
  mountGate,
  type BannerHandle,
  type BannerHandlers,
  type BannerProps,
  mountInspector,
  type GateHandle,
  type InspectorHandle,
} from '@okolos/ui'
import { worstOf } from '@okolos/contracts'
import type {
  AgentAction,
  Severity,
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
import { createSurfaceSlot } from './surface-slot.js'
import { failOpen } from './fail-open.js'
import { createJournalOnce } from './journal-once.js'

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

let inspector: InspectorHandle | null = null
let gate: GateHandle | null = null

/**
 * One in-page warning panel, and one place that decides which finding holds it.
 *
 * Six modules used to mount their own, and on a page that was both a lookalike and
 * poisoned two panels were drawn at identical coordinates — one exactly on top of the
 * other (B-69). The slot also owns the re-mount watch, which had been wired into two
 * of those six sites: both are rules about the surface, and a rule about the surface
 * applied per source is the defect, not the fix.
 */
/**
 * One record per distinct fact, for this frame.
 *
 * The journal has a retention period, so repeated identical lines evict what happened
 * once. Three writers here could produce them — the standing restore refusal (B-64),
 * the slot's refused claims, and the scan's give-up — and all three go through this.
 * The screen is unaffected: a person pressing a button is answered every time.
 */
const journal = createJournalOnce()

const slot = createSurfaceSlot({
  doc: document,
  noteRefused: (kind, severity) => {
    // Not drawn is not lost: the popup and the journal hold every finding, and this
    // line is what makes the refusal readable afterwards rather than inferred. Once
    // per kind, because a page with several findings of one kind asks more than once.
    const explain = t('noteSecondWarning', kind, severity)
    void journal.record(`second:${kind}`, async () => {
      await platform.runtime.send('page/note', { kind: 'gate-unread', explain })
    })
  },
  alsoLine: (kinds) => t('warnAlsoHere', String(kinds.length)),
  mounted: () => {
    // From the navigation's time origin, which is what a person waited from. Wrapped
    // because a page can have taken the API away, and a missing measurement must not
    // be the reason a warning does not appear.
    try {
      performance.measure(MEASURE_TO_BANNER)
    } catch {
      // Nothing to report is better than a throw on the path to the surface.
    }
  },
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  escalate: async (removals) => {
    // The watch escalates once by construction, so this is belt and braces rather
    // than the flood guard the other two need.
    const explain = t('noteSurfaceRemoved', String(removals))
    await journal.record('surface-removed', async () => {
      await platform.runtime.send('page/note', { kind: 'surface-removed', explain })
    })
  },
})



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
 * From the navigation to the warning being on screen — the number SCN-003 promises in
 * words and nothing measured.
 *
 * "Before the page settles" is a promise, not a figure, and the only thing anywhere
 * that said anything about this delay was a test's ten-second wait, written into
 * thirteen files and measured nowhere (B-65). Twice a CI run failed a spec that was
 * not about mounting because the banner had not arrived: `scn-010` on a cold runner and
 * `hostile-page` on a colour token.
 *
 * Measured from the navigation's own start rather than from when the content script
 * happened to run: what a person waits is from pressing enter, and the script's start
 * is part of that wait. `performance.measure` with no start mark uses the time origin,
 * which for a document *is* the navigation start.
 */
export const MEASURE_TO_BANNER = 'okolos:banner'

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

  if (page.candidates.length === 0) {
    /**
     * Nothing found is not the same fact as nothing to find.
     *
     * A page can spend the whole traversal allowance on markup that carries nothing —
     * six thousand comments in `<head>` did exactly that — and the scan then returned
     * zero candidates and exited without a word: no banner, no record, and a person
     * believing the page had been checked (B-40).
     *
     * Journalled, not bannered. A banner on every large page would cry wolf, and the
     * journal is the surface this product already uses for "we looked and could not
     * finish" — `scan-failed` from B-74 is the same shape. Once per page, through the
     * same `journal.record` that keeps a mutating page from writing the same line all
     * afternoon.
     */
    if (page.truncated) {
      void journal.record('scan-blinded', async () => {
        await platform.runtime.send('page/note', {
          kind: 'scan-blinded',
          explain: t('noteScanBlinded'),
        })
      })
    }
    return
  }

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

  slot.claim({
    kind: 'frame',
    severity: 'major',
    props: {
      variant: 'injection',
      severity: 'major',
      headline: t('warnFrameHeadline', where),
      detail: t('warnFramePlain', finding.summary, more),
      sourceLine: t('warnFrameSource'),
      primaryLabel: t('warnFrameJournal'),
    },
    handlers: {
      onPrimary: openFrameJournal,
      onRetry: openFrameJournal,
      onDispute: resolveEverything,
      onDismiss: resolveEverything,
    },
  })
}

function openFrameJournal(): void {
  void platform.runtime.send('recovery/open', { kind: 'journal' }).catch(() => undefined)
}

function show(verdict: Verdict, total: number, partialScan: boolean, neutralised: number): void {

  // Both were English literals the sweep could not see either: one begins with a
  // space, the other with a space and then a word, and its anchor wanted a letter
  // immediately after the quote.
  const others = total > 1 ? t('warnInjectionOthers', String(total - 1)) : ''
  const scanNote = partialScan ? t('warnScanTruncated') : ''

  slot.claim({
    kind: 'injection',
    severity: verdict.severity,
    props: {
      variant: 'injection',
      severity: verdict.severity,
      headline: t('warnInjectionHeadline'),
      detail:
        neutralised > 0
          ? t('warnInjectionNeutralised', others, scanNote)
          : t('warnInjectionPlain', others, scanNote),
      sourceLine: t('warnFoundBy', verdict.sources.map((s) => s.name).join(', ')),
    },
    handlers: {
      onPrimary: () => openInspector(verdict),
      onRetry: () => openInspector(verdict),
      onDispute: resolveEverything,
      onDismiss: () => {
        closeInspector()
        resolveEverything()
      },
    },
  })
}

/** The user has said this page is fine. The gate stands down with the banner. */
/**
 * The mount every other content module is given, so none of them can draw beside the
 * panel that is up. `kind` is the variant, which is what a reader would call it.
 */
function warningMount(kind: string, severity: Severity) {
  return (props: BannerProps, handlers: BannerHandlers): BannerHandle =>
    slot.claim({ kind, severity, props, handlers })
}

function resolveEverything(): void {
  unresolved = []
  armPageWatch(false)
  slot.release()
}

/**
 * Turns a restore's outcome into a sentence, or null when it finished.
 *
 * Two ways the page moves underneath one, and they read differently to the
 * person holding the button: the element left the page, or the page wrote its
 * own content into it. Neither is a failure of the product, and both are worth
 * saying out loud.
 */
/**
 * What a restore managed, in the reader's language.
 *
 * **It was English, with English pluralisation, on a ru-default interface.**
 * `1 passage was / 2 passages were`, `it / them`, `1 was / 2 were` — three grammatical
 * choices no Russian sentence can borrow, and the sweep could not see any of them
 * because the literal begins with `${outcome.gone}` (B-51).
 *
 * **Worded to need no agreement at all, which is a decision and not a shortcut.**
 * Russian needs three plural forms where English needs two, `chrome.i18n` has no
 * plural support, and picking the form in code means either hardcoding one language's
 * grammar or trusting `Intl.PluralRules` to agree with the locale `chrome.i18n`
 * actually resolved. Both are machinery around a problem the copy can simply not have:
 * "не вернулось фрагментов: 3" reads correctly for every count, and so does "left
 * alone: 1". The brand pack prefers the form that needs no grammar games.
 */
function explainRestore(outcome: { restored: number; gone: number; changed: number }): string {
  const parts: string[] = []
  if (outcome.gone > 0) parts.push(t('contentRestoreGone', String(outcome.gone)))
  if (outcome.changed > 0) parts.push(t('contentRestoreChanged', String(outcome.changed)))
  const restored =
    outcome.restored > 0
      ? t('contentRestoreDone', String(outcome.restored))
      : t('contentNothingRestored')
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
        // The sentence, every press. That is the screen's contract and B-36's whole
        // point: a refusal is a standing fact about the page, and every press must say
        // the same thing rather than the second one retracting the first.
        openInspector(verdict, note)
        // The record, once. Ten presses on one node used to be ten identical journal
        // lines, evicting what happened once from a store with a retention period.
        void journal.record(`restore:${note}`, async () => {
          await platform.runtime.send('page/note', { kind: 'restore', explain: note })
        })
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

/** The project's fail-open wrapper, wired to this frame's console and journal. */
async function safely(work: () => Promise<void>): Promise<void> {
  await failOpen(work, {
    warn: (cause) => {
      console.warn('okolos: scan failed', cause)
    },
    note: async (cause) => {
      /**
       * The journal, not the badge: a worker restart is ordinary, and an icon that
       * cries wolf on every one of them is how a badge stops meaning anything.
       *
       * Once per distinct cause: a page that mutates while the worker is unavailable
       * fails its rescan over and over, and the same sentence repeated is the flood
       * this store cannot afford. A *different* cause is new information and is written.
       */
      const explain = t('noteScanFailed', String(cause))
      await journal.record(`scan:${explain}`, async () => {
        await platform.runtime.send('page/note', { kind: 'scan-failed', explain })
      })
    },
  })
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
    mountWarning: warningMount('lookalike', 'major'),
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
    mountWarning: warningMount('trap', 'critical'),
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
    mountWarning: warningMount('credential', 'major'),
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
/**
 * Why a password check answered what it did, in the reader's language.
 *
 * The package sent six English sentences across the RPC, one of them with the count
 * already formatted by `toLocaleString('en')` — an English thousands separator chosen
 * inside a package that has no business knowing the reader's locale (B-75). The count
 * travels as a number now and is formatted here, with no locale argument, so the
 * runtime's own is used.
 */
const PASSWORD_EXPLAIN_KEY: Record<string, string> = {
  'in-common-list': 'pwdExplainCommon',
  unreachable: 'pwdExplainUnreachable',
  unreadable: 'pwdExplainUnreadable',
  absent: 'pwdExplainAbsent',
  found: 'pwdExplainFound',
}

/** One explanation, in words. An unknown code shows itself rather than nothing. */
function explainPassword(explain: { code: string; detail?: string; count?: number }): string {
  const key = PASSWORD_EXPLAIN_KEY[explain.code]
  if (key === undefined) return explain.code
  if (explain.code === 'unreachable') return t(key, explain.detail ?? '')
  if (explain.code === 'found') return t(key, (explain.count ?? 0).toLocaleString())
  return t(key)
}

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

          slot.claim({
            kind: 'password',
            severity: 'major',
            props: {
              variant: 'password',
              severity: 'major',
              headline: t('warnPasswordHeadline'),
              // The reuse line is appended rather than replacing the verdict:
              // "this password is in a breach" and "you use it in four places"
              // are two facts, and the second is what turns the first into
              // something to do this evening.
              detail: `${explainPassword(verdict.explain)} ${reuseLine(verdict)}`,
              sourceLine: t(
                'warnFoundBy',
                verdict.offline ? t('warnPasswordSourceOffline') : t('warnPasswordSourceOnline'),
              ),
            },
            handlers: {
              onPrimary: () => undefined,
              onRetry: () => undefined,
              onDispute: () => undefined,
              onDismiss: () => undefined,
            },
          })
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
        mountWarning: warningMount('download', 'major'),
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
     * **The rule this recorded is now the slot's, for every source.** It said: if the
     * page already has a banner up for its own finding, the frame's is left to the
     * journal rather than drawn as a second overlay. That was right and it was applied
     * here only — two other sources kept mounting a second panel, which is how a page
     * that was both a lookalike and poisoned ended up with one warning drawn exactly
     * on top of another (B-69). The claim below goes to the same slot as everything
     * else: a `major` finding does not displace a worse one, and it becomes a line on
     * the panel that is up instead of a panel beside it.
     */
    if (message.type === 'frame/finding') {
      const finding = message.payload as { origin: string; summary: string; count: number }
      showFrameFinding(finding)
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
