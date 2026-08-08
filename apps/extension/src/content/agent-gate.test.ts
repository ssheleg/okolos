/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GateChoice, GateDecision, UnresolvedFinding } from '@okolos/core-gate'

import { AgentGate, type GateEnvironment } from './agent-gate.js'

const FINDING: UnresolvedFinding = { id: 'f1', summary: 'Hidden instruction on this page' }

interface Harness {
  readonly gate: AgentGate
  readonly ask: ReturnType<typeof vi.fn>
  readonly journal: GateDecision[]
}

const installed: AgentGate[] = []

function install(overrides: Partial<GateEnvironment> = {}): Harness {
  const journal: GateDecision[] = []
  const ask = vi.fn(async (): Promise<GateChoice> => 'block')
  let n = 0
  const env: GateEnvironment = {
    doc: document,
    unresolved: () => [FINDING],
    ask: ask as unknown as GateEnvironment['ask'],
    expiry: () => new Promise<void>(() => {}),
    journal: (decision) => journal.push(decision),
    newId: () => `a${(n += 1)}`,
    // The ordinary browser by default; the driven one is stated per test.
    automated: () => false,
    ...overrides,
  }
  const gate = new AgentGate(env)
  gate.install()
  installed.push(gate)
  return { gate, ask, journal }
}

/**
 * A synthetic event, which is what an agent acting through page script
 * produces: `isTrusted` is false. It is *not* what a browser agent driving
 * Chrome produces — measured 2026-08-08, automation input is trusted, which is
 * why the gate also reads whether the browser is being driven.
 */
function scripted(type: string): Event {
  return new Event(type, { bubbles: true, cancelable: true })
}

function human(type: string): Event {
  const event = scripted(type)
  Object.defineProperty(event, 'isTrusted', { value: true })
  return event
}

function form(html = '<input name="q"><button type="submit">Go</button>'): HTMLFormElement {
  document.body.innerHTML = `<form action="https://bank.test/transfer?amount=900" aria-label="Transfer">${html}</form>`
  return document.querySelector('form') as HTMLFormElement
}

/** Lets the promise chain inside the interceptor settle. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  // Listeners live on the document, not on the markup. A gate left installed
  // would intercept the next test's events before its own gate ever saw them.
  while (installed.length > 0) installed.pop()?.uninstall()
})

describe('when the page has nothing unresolved', () => {
  it('does not touch a scripted submit', async () => {
    const { ask } = install({ unresolved: () => [] })
    const event = scripted('submit')
    form().dispatchEvent(event)
    await settle()

    expect(event.defaultPrevented).toBe(false)
    expect(ask).not.toHaveBeenCalled()
  })
})

describe('when the page carries an unresolved finding', () => {
  it('holds a scripted submit before it leaves the page', async () => {
    const { ask } = install()
    const event = scripted('submit')
    form().dispatchEvent(event)
    await settle()

    expect(event.defaultPrevented).toBe(true)
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('does not hold a submit the person made themselves', async () => {
    const { ask } = install()
    const event = human('submit')
    form().dispatchEvent(event)
    await settle()

    expect(event.defaultPrevented).toBe(false)
    expect(ask).not.toHaveBeenCalled()
  })

  it('holds a trusted submit when the browser says it is being driven', async () => {
    // The wiring, not the rule. `assessAction` weighs `automated`; whether this
    // file ever asks for it is a separate question, and the answer was no until
    // now — which is how a browser agent's trusted clicks passed as the user's.
    const { ask } = install({ automated: () => true })
    const event = human('submit')
    form().dispatchEvent(event)
    await settle()

    expect(event.defaultPrevented).toBe(true)
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('keeps the page from seeing the held event', async () => {
    install()
    const seen = vi.fn()
    const f = form()
    f.addEventListener('submit', seen)
    f.dispatchEvent(scripted('submit'))
    await settle()

    expect(seen).not.toHaveBeenCalled()
  })

  it('tells the user which form, and where it was going', async () => {
    const { ask } = install()
    form().dispatchEvent(scripted('submit'))
    await settle()

    const action = ask.mock.calls[0]?.[0]
    expect(action.description).toContain('Transfer')
    expect(action.target).toBe('https://bank.test/transfer')
    // The query string is where the amount lives. It never reaches the surface.
    expect(action.target).not.toContain('900')
  })
})

describe('what happens after the decision', () => {
  it('does not resubmit when the user blocks', async () => {
    install({ ask: async () => 'block' })
    const f = form()
    const resubmit = vi.spyOn(f, 'requestSubmit').mockImplementation(() => {})
    f.dispatchEvent(scripted('submit'))
    await settle()

    expect(resubmit).not.toHaveBeenCalled()
  })

  it('performs the action when the user allows it once', async () => {
    install({ ask: async () => 'allow-once' })
    const f = form()
    const resubmit = vi.spyOn(f, 'requestSubmit').mockImplementation(() => {})
    f.dispatchEvent(scripted('submit'))
    await settle()

    expect(resubmit).toHaveBeenCalledTimes(1)
  })

  it('does not gate the action it was just told to allow', async () => {
    // Without this the allowed action is caught by the same listener and the
    // user is asked forever.
    const ask = vi.fn(async (): Promise<GateChoice> => 'allow-once')
    install({ ask })
    const f = form()
    vi.spyOn(f, 'requestSubmit').mockImplementation(() => {
      f.dispatchEvent(scripted('submit'))
    })
    f.dispatchEvent(scripted('submit'))
    await settle()

    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('journals every held action, blocked or allowed', async () => {
    const { journal } = install({ ask: async () => 'allow-once' })
    form().dispatchEvent(scripted('submit'))
    await settle()

    expect(journal).toHaveLength(1)
    expect(journal[0]).toMatchObject({ outcome: 'allowed-once', findingIds: ['f1'] })
  })

  it('does not journal pages where nothing was held', async () => {
    const { journal } = install({ unresolved: () => [] })
    form().dispatchEvent(scripted('submit'))
    await settle()

    expect(journal).toEqual([])
  })

  it('blocks and journals when the surface cannot be shown', async () => {
    const { journal } = install({
      ask: async () => {
        throw new Error('no room to draw')
      },
    })
    const f = form()
    const resubmit = vi.spyOn(f, 'requestSubmit').mockImplementation(() => {})
    f.dispatchEvent(scripted('submit'))
    await settle()

    expect(resubmit).not.toHaveBeenCalled()
    expect(journal[0]).toMatchObject({ outcome: 'blocked', reason: 'unavailable' })
  })

  it('blocks when nobody answers', async () => {
    const { journal } = install({
      ask: () => new Promise<GateChoice>(() => {}),
      expiry: async () => undefined,
    })
    form().dispatchEvent(scripted('submit'))
    await settle()

    expect(journal[0]).toMatchObject({ outcome: 'blocked', reason: 'timeout' })
  })
})

describe('clicks', () => {
  it('holds a scripted click that would navigate away', async () => {
    const { ask } = install()
    document.body.innerHTML = '<a href="https://elsewhere.test/pay">Pay</a>'
    const link = document.querySelector('a') as HTMLAnchorElement
    const event = scripted('click')
    link.dispatchEvent(event)
    await settle()

    expect(event.defaultPrevented).toBe(true)
    expect(ask.mock.calls[0]?.[0].kind).toBe('navigation')
  })

  it('holds a scripted click on a submit button', async () => {
    const { ask } = install()
    const f = form()
    ;(f.querySelector('button') as HTMLButtonElement).dispatchEvent(scripted('click'))
    await settle()

    expect(ask.mock.calls[0]?.[0].kind).toBe('form-submit')
  })

  it('recognises a download for what it is', async () => {
    const { ask } = install()
    document.body.innerHTML = '<a href="https://files.test/setup.exe" download>Get it</a>'
    ;(document.querySelector('a') as HTMLAnchorElement).dispatchEvent(scripted('click'))
    await settle()

    expect(ask.mock.calls[0]?.[0].kind).toBe('download')
  })

  it('ignores scripted clicks that go nowhere', async () => {
    // Pages click their own tabs, menus and cards constantly. Holding those
    // would make the extension the thing that broke the web.
    const { ask } = install()
    document.body.innerHTML = '<div id="tab">Details</div>'
    const event = scripted('click')
    ;(document.querySelector('#tab') as HTMLElement).dispatchEvent(event)
    await settle()

    expect(event.defaultPrevented).toBe(false)
    expect(ask).not.toHaveBeenCalled()
  })
})

describe('the boundary, stated so it is a decision and not an oversight', () => {
  it('does not hold a scripted click on a button that belongs to no form', async () => {
    /**
     * This is the gap, pinned deliberately. `#describe` returns null for a
     * control outside a form, on the reasoning that it is "not an action
     * leaving the page" — true of a tab or a card, and false of the button
     * every modern application uses to move money, which fires `fetch` and
     * navigates nowhere.
     *
     * The premise held when actions were navigations. It does not hold for a
     * single-page application, and SCN-010's "no action proceeds without an
     * explicit human decision" is wider than what this gate delivers. The
     * scenario now says so in its Known limit; this test is the other half, so
     * that a change here has to be a change to a stated decision.
     *
     * Closing it properly means intercepting fetch and XHR that no human
     * gesture started — a bigger change, with the noise risk the code comment
     * beside `#describe` warns about. Tracked, not forgotten.
     */
    const { ask } = install()
    document.body.innerHTML = '<button id="pay" type="button">Transfer</button>'
    const event = scripted('click')
    ;(document.querySelector('#pay') as HTMLElement).dispatchEvent(event)
    await settle()

    expect(event.defaultPrevented, 'the action is not held today').toBe(false)
    expect(ask, 'and the user is not asked').not.toHaveBeenCalled()
  })

  it('still holds the same button once it is inside a form', async () => {
    // The difference is the form, and nothing else. Stated here so the shape
    // of the gap is unmistakable to whoever closes it.
    const { ask } = install()
    document.body.innerHTML =
      '<form action="/transfer" aria-label="Transfer"><button id="pay">Transfer</button></form>'
    const event = scripted('click')
    ;(document.querySelector('#pay') as HTMLElement).dispatchEvent(event)
    await settle()

    expect(event.defaultPrevented).toBe(true)
    expect(ask).toHaveBeenCalled()
  })
})

describe('actions nobody can name', () => {
  it('blocks a link whose destination will not parse, without asking', async () => {
    const { ask, journal } = install()
    document.body.innerHTML = '<a href="javascript:transfer()">Continue</a>'
    const event = scripted('click')
    ;(document.querySelector('a') as HTMLAnchorElement).dispatchEvent(event)
    await settle()

    expect(event.defaultPrevented).toBe(true)
    expect(ask).not.toHaveBeenCalled()
    expect(journal[0]).toMatchObject({ outcome: 'blocked', reason: 'unidentified' })
  })

  it('blocks a submit event fired at something that is not a form', async () => {
    const { journal } = install()
    document.body.innerHTML = '<div id="fake"></div>'
    ;(document.querySelector('#fake') as HTMLElement).dispatchEvent(scripted('submit'))
    await settle()

    expect(journal[0]).toMatchObject({ reason: 'unidentified' })
  })
})

describe('the page survives us', () => {
  it('does not throw when the form vanishes between the hold and the allow', async () => {
    install({ ask: async () => 'allow-once' })
    const f = form()
    f.dispatchEvent(scripted('submit'))
    f.remove()
    document.body.innerHTML = ''

    await expect(settle()).resolves.toBeUndefined()
  })
})
