import { assessAction, resolveGate, type AgentAction, type GateChoice, type GateDecision, type UnresolvedFinding } from '@okolos/core-gate'

/**
 * Catching an action before it happens.
 *
 * The decision logic lives in `@okolos/core-gate`; this is the part that has to
 * touch a hostile page. It listens in the capture phase for the two events that
 * actually carry a sensitive action out of a page — a form submitting and a
 * click that navigates or downloads — and holds the ones no human started.
 *
 * `isTrusted` is the whole basis for "no human started it". The browser sets it,
 * a page cannot forge it, and it is false for anything dispatched from script —
 * which is exactly how an agent driving a page acts. It is not a complete net:
 * a page calling `form.submit()` fires no event at all, and there is no way to
 * see that from an isolated world. That gap is stated in the docs rather than
 * papered over, because a guard that overstates its reach is worse than one
 * whose limits are known.
 */

export interface GateEnvironment {
  readonly doc: Document
  /** Findings on this page the user has not handled. Empty means no gate. */
  unresolved: () => readonly UnresolvedFinding[]
  /** Opens the surface and resolves with what the user chose. */
  ask: (action: AgentAction, findings: readonly UnresolvedFinding[]) => Promise<GateChoice>
  /** Settles when the user has had long enough. Injected so tests need no clock. */
  expiry: () => Promise<void>
  journal: (decision: GateDecision) => void
  newId: () => string
}

export class AgentGate {
  /**
   * True only while we are re-performing an action the user allowed. Both
   * `requestSubmit()` and `click()` dispatch synchronously, so a plain flag is
   * enough — and it is what stops an allowed action from being gated forever.
   */
  #replaying = false
  readonly #handle = (event: Event) => this.#intercept(event)

  constructor(private readonly env: GateEnvironment) {}

  install(): void {
    this.env.doc.addEventListener('submit', this.#handle, true)
    this.env.doc.addEventListener('click', this.#handle, true)
  }

  uninstall(): void {
    this.env.doc.removeEventListener('submit', this.#handle, true)
    this.env.doc.removeEventListener('click', this.#handle, true)
  }

  #intercept(event: Event): void {
    if (this.#replaying) return

    const findings = this.env.unresolved()
    // The fast path, and the one that runs on every page: nothing unresolved
    // here, so nothing to weigh. No allocation, no work.
    if (findings.length === 0) return

    const described = this.#describe(event)
    if (!described) return

    const assessment = assessAction(described, findings)
    // Decide before cancelling. Holding first and asking afterwards would
    // swallow the user's own clicks on a flagged page — the gate is for actions
    // no human started, and a guard that eats real clicks is a broken page.
    if (!assessment.ask && assessment.decision.outcome === 'ungated') return

    event.preventDefault()
    event.stopImmediatePropagation()

    void resolveGate(assessment, () => this.env.ask(described, findings), this.env.expiry())
      .then((decision) => {
        if (decision.outcome !== 'ungated') this.env.journal(decision)
        if (decision.outcome === 'allowed-once') this.#replay(event)
      })
      .catch(() => {
        // Unreachable by design — resolveGate turns every failure into a block —
        // but a rejected promise inside someone's page must not surface as an
        // unhandled rejection either.
      })
  }

  #replay(event: Event): void {
    this.#replaying = true
    try {
      const target = event.target
      if (event.type === 'submit' && target instanceof HTMLFormElement) {
        target.requestSubmit(submitterOf(event))
      } else if (target instanceof HTMLElement) {
        target.click()
      }
    } catch {
      // The page changed under us between the hold and the decision. The action
      // is lost; the page is not.
    } finally {
      this.#replaying = false
    }
  }

  #describe(event: Event): AgentAction | null {
    const id = this.env.newId()
    const humanGesture = event.isTrusted

    if (event.type === 'submit') {
      const form = event.target
      if (!(form instanceof HTMLFormElement)) {
        return { id, kind: 'unknown', description: 'A form submission', humanGesture }
      }
      return {
        id,
        kind: 'form-submit',
        description: `Submit ${describeForm(form)}`,
        ...withTarget(safeUrl(form.action)),
        humanGesture,
      }
    }

    const element = event.target
    if (!(element instanceof Element)) return null

    const anchor = element.closest('a[href]')
    if (anchor instanceof HTMLAnchorElement) {
      const target = safeUrl(anchor.href)
      if (!target) {
        // A `javascript:` href, or something that will not parse. We can see
        // that a script clicked it and not where it goes.
        return { id, kind: 'unknown', description: 'Follow a link on this page', humanGesture }
      }
      return anchor.hasAttribute('download')
        ? { id, kind: 'download', description: 'Download a file', target, humanGesture }
        : { id, kind: 'navigation', description: `Open ${target}`, target, humanGesture }

    }

    const control = element.closest('button, input[type=submit], input[type=image]')
    const form = control instanceof HTMLElement ? control.closest('form') : null
    if (control && form instanceof HTMLFormElement) {
      return {
        id,
        kind: 'form-submit',
        description: `Submit ${describeForm(form)}`,
        ...withTarget(safeUrl(form.action)),
        humanGesture,
      }
    }

    // Everything else a script clicks — a menu, a tab, a card — is not an action
    // leaving the page. Gating it would be noise, and noise is what gets a
    // security product turned off.
    return null
  }
}

/** `exactOptionalPropertyTypes`: an absent target is absent, not `undefined`. */
function withTarget(target: string | undefined): { target?: string } {
  return target === undefined ? {} : { target }
}

function describeForm(form: HTMLFormElement): string {
  const name = form.getAttribute('aria-label') ?? form.getAttribute('name') ?? ''
  if (name.trim() !== '') return `the "${name.trim()}" form`
  const password = form.querySelector('input[type=password]')
  return password ? 'a form containing a password' : 'a form on this page'
}

/** Origin and path only: a query string can carry the very thing we protect. */
function safeUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    return `${url.origin}${url.pathname}`
  } catch {
    return undefined
  }
}

function submitterOf(event: Event): HTMLElement | undefined {
  const submitter = (event as SubmitEvent).submitter
  return submitter instanceof HTMLElement ? submitter : undefined
}
