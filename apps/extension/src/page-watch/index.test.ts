/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest'

import { watchPage } from './index.js'

/**
 * The watcher's whole promise is negative: it must not change what the page
 * gets. So most of what is asserted here is that nothing happened — the same
 * arguments, the same return value, and no waiting in between.
 */

/** A window with just enough of the two APIs the watcher wraps. */
function fakeWindow(): {
  win: Window & typeof globalThis
  calls: Array<{ input: unknown; init: unknown }>
  posted: unknown[]
  result: unknown
  /**
   * Delivers a message as if it came from somewhere else.
   *
   * `postMessage` on this fake always reports `source: win`, which is the
   * ordinary case. A frame's message arrives with a different source, and the
   * only way to express that is to hand the listeners one — the first version of
   * that test called `win.dispatchEvent`, which this fake does not have, so it
   * delivered nothing and asserted that nothing happened.
   */
  deliver: (data: unknown, source: unknown) => void
} {
  const calls: Array<{ input: unknown; init: unknown }> = []
  const posted: unknown[] = []
  const result = { body: 'the original response' }
  const listeners: Array<(event: MessageEvent) => void> = []

  const win = {
    fetch: (input: unknown, init: unknown) => {
      calls.push({ input, init })
      return Promise.resolve(result)
    },
    XMLHttpRequest: function XHR() {} as unknown as typeof XMLHttpRequest,
    postMessage: (data: unknown) => {
      posted.push(data)
      // The isolated world's listener is the page's listener here.
      for (const fn of listeners) fn({ source: win, data } as unknown as MessageEvent)
    },
    addEventListener: (_type: string, fn: (event: MessageEvent) => void) => listeners.push(fn),
    location: { href: 'https://page.test/here' },
  } as unknown as Window & typeof globalThis

  ;(win.XMLHttpRequest as unknown as { prototype: Record<string, unknown> }).prototype = {
    open: () => undefined,
    send: () => undefined,
  }

  const deliver = (data: unknown, source: unknown) => {
    for (const fn of listeners) fn({ source, data } as unknown as MessageEvent)
  }

  return { win, calls, posted, result, deliver }
}

function arm(win: Window & typeof globalThis): void {
  win.postMessage({ source: 'okolos:page-watch:arm' }, '*')
}

describe('the page watcher never changes what the page gets', () => {
  it('passes the arguments through exactly as given', async () => {
    const { win, calls } = fakeWindow()
    watchPage(win)
    arm(win)

    const init = { method: 'POST', body: 'amount=900' }
    await win.fetch('https://bank.test/transfer', init)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.input).toBe('https://bank.test/transfer')
    // The same object, not a copy: a rebuilt init is a request we composed.
    expect(calls[0]?.init).toBe(init)
  })

  it('returns what the original returned', async () => {
    const { win, result } = fakeWindow()
    watchPage(win)
    arm(win)
    await expect(win.fetch('https://bank.test/transfer', { method: 'POST' })).resolves.toBe(result)
  })

  it('reports a state-changing request as host and method, never the path', async () => {
    const { win, posted } = fakeWindow()
    watchPage(win)
    arm(win)
    await win.fetch('https://bank.test/transfer?amount=900', { method: 'POST' })

    const report = posted.find(
      (m) => (m as { source?: string }).source === 'okolos:page-watch:report',
    ) as { method: string; host: string } | undefined
    expect(report).toEqual({ source: 'okolos:page-watch:report', method: 'POST', host: 'bank.test' })
  })

  it('says nothing about a GET, which is how a page reads', async () => {
    const { win, posted } = fakeWindow()
    watchPage(win)
    arm(win)
    await win.fetch('https://bank.test/balance')
    expect(posted.filter((m) => (m as { source?: string }).source === 'okolos:page-watch:report')).toEqual([])
  })

  it('says nothing at all until it is armed', async () => {
    const { win, posted } = fakeWindow()
    watchPage(win)
    // No arm message: an ordinary page with no finding on it.
    await win.fetch('https://bank.test/transfer', { method: 'POST' })
    expect(posted).toEqual([])
  })

  it('cannot be turned off by the page it is watching', async () => {
    /**
     * There was a `disarm` on this channel and the listener took it from
     * `event.source === win` — which is exactly what the page's own
     * `postMessage` satisfies. One line of page script and the watcher was quiet
     * for the rest of the page's life. The module's own docstring said a forged
     * line costs "noise, not silence", and the code sold silence.
     *
     * Nothing in the MAIN world can tell the isolated world's message from the
     * page's: they share a window, and the MAIN world *is* the page's. So the
     * channel is one-way instead of authenticated — the page can turn the
     * watcher on, which is the noise the docstring admits to, and has nothing to
     * say about turning it off.
     */
    const { win, posted } = fakeWindow()
    watchPage(win)
    arm(win)
    win.postMessage({ source: 'okolos:page-watch:disarm' }, '*')

    await win.fetch('https://bank.test/transfer', { method: 'POST' })
    const reports = posted.filter(
      (m) => (m as { source?: string }).source === 'okolos:page-watch:report',
    )
    expect(reports, 'the page silenced the one mechanism whose value is the record').toHaveLength(1)
  })

  it('ignores every other shape of off switch a page might guess at', async () => {
    /**
     * One message per case, on purpose. The first version of this test sent the
     * disarm and then two more guesses — and the last of them was
     * `{ source: ARM, armed: false }`, which **re-armed** the watcher, so
     * re-adding the disarm branch as a plant changed nothing and the test stayed
     * green about the attack it was named for. A test whose later steps undo the
     * attack it is testing measures its own tail.
     *
     * A forged *report* is deliberately not in this list: it is not an attempt to
     * silence anything, and what happens to it is decided in the background,
     * where `page-requests.test.ts` asserts a report from a clean origin writes
     * nothing. Counting it here would also have counted the message this test
     * posted, which is how the list first grew a case that measured the fixture.
     */
    for (const guess of [
      { source: 'okolos:page-watch:disarm' },
      { source: 'okolos:page-watch:off' },
      { source: 'okolos:page-watch:arm', armed: false },
      { source: 'okolos:page-watch:disarm', armed: false },
      { source: null },
      {},
    ]) {
      const { win, posted } = fakeWindow()
      watchPage(win)
      arm(win)
      win.postMessage(guess, '*')

      await win.fetch('https://bank.test/transfer', { method: 'POST' })
      const reports = posted.filter(
        (m) => (m as { source?: string }).source === 'okolos:page-watch:report',
      )
      expect(reports, `silenced by ${JSON.stringify(guess)}`).toHaveLength(1)
    }
  })

  it('arms once, however many times it is told to', async () => {
    // Arming is idempotent because it is the only thing this channel does, and a
    // page spamming it must not multiply the reports for one request.
    const { win, posted } = fakeWindow()
    watchPage(win)
    for (let i = 0; i < 5; i += 1) arm(win)
    await win.fetch('https://bank.test/transfer', { method: 'POST' })
    const reports = posted.filter(
      (m) => (m as { source?: string }).source === 'okolos:page-watch:report',
    )
    expect(reports).toHaveLength(1)
  })

  it('still ignores a message from another window', async () => {
    // A frame must not arm its parent's watcher: the parent's journal would fill
    // with requests made somewhere else, attributed to the page the user is on.
    const { win, posted, deliver } = fakeWindow()
    watchPage(win)
    deliver({ source: 'okolos:page-watch:arm' }, { name: 'some other frame' })

    await win.fetch('https://bank.test/transfer', { method: 'POST' })
    expect(posted, 'a frame armed the parent’s watcher').toEqual([])
  })

  it('arms from this window, so the check above is not passing on a broken fake', () => {
    /**
     * The other direction of the same rule, and the reason it is here: the first
     * version of the test above called `win.dispatchEvent`, which this fake does
     * not have. It delivered nothing, asserted that nothing happened, and was
     * green about a listener it never reached.
     */
    const { win, posted, deliver } = fakeWindow()
    watchPage(win)
    deliver({ source: 'okolos:page-watch:arm' }, win)
    void win.fetch('https://bank.test/transfer', { method: 'POST' })
    expect(posted.length, 'delivery through this helper reaches nothing').toBeGreaterThan(0)
  })

  it('still makes the call when reporting throws', async () => {
    const { win, calls } = fakeWindow()
    watchPage(win)
    arm(win)
    // The page can break postMessage. The request must not notice.
    vi.spyOn(win, 'postMessage').mockImplementation(() => {
      throw new Error('the page broke the channel')
    })
    await win.fetch('https://bank.test/transfer', { method: 'POST' })
    expect(calls).toHaveLength(1)
  })

  it('resolves a relative target against the page, because that is where it goes', async () => {
    const { win, posted } = fakeWindow()
    watchPage(win)
    arm(win)
    await win.fetch('/transfer', { method: 'POST' })

    // Written first as "an unparseable URL reports nothing", which was wrong:
    // almost anything resolves against a base, and a POST to a relative path is
    // a state-changing request to the page's own host. That is worth recording,
    // so this asserts what happens rather than what was assumed.
    const report = posted.find(
      (m) => (m as { source?: string }).source === 'okolos:page-watch:report',
    ) as { host: string } | undefined
    expect(report?.host).toBe('page.test')
  })

  it('says nothing when the target is not a URL at all', async () => {
    const { win, calls, posted } = fakeWindow()
    watchPage(win)
    arm(win)
    await win.fetch({ nonsense: true } as never, { method: 'POST' })
    expect(calls).toHaveLength(1)
    expect(posted.filter((m) => (m as { source?: string }).source === 'okolos:page-watch:report')).toEqual([])
  })
})
