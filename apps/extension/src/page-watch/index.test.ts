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

  return { win, calls, posted, result }
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

  it('stops again when the finding is dealt with', async () => {
    const { win, posted } = fakeWindow()
    watchPage(win)
    arm(win)
    win.postMessage({ source: 'okolos:page-watch:disarm' }, '*')
    await win.fetch('https://bank.test/transfer', { method: 'POST' })
    expect(posted.filter((m) => (m as { source?: string }).source === 'okolos:page-watch:report')).toEqual([])
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
