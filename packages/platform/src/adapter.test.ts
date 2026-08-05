import { describe, expect, it, vi } from 'vitest'
import type { Envelope } from '@okolos/contracts'

import { createPlatform, toSafeUrl } from './adapter.js'
import type { WebExtensionApi } from './types.js'

function fakeApi(overrides: Partial<WebExtensionApi> = {}): WebExtensionApi {
  const store: Record<string, unknown> = {}
  return {
    storage: {
      local: {
        get: async (key) => (typeof key === 'string' ? { [key]: store[key] } : { ...store }),
        set: async (items) => {
          Object.assign(store, items)
        },
        remove: async (key) => {
          delete store[key as string]
        },
      },
    },
    alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
    runtime: { sendMessage: vi.fn(async () => ({ ok: true })), onMessage: { addListener: vi.fn() } },
    tabs: { query: async () => [{ url: 'https://example.test/a/b?token=secret#frag' }] },
    ...overrides,
  }
}

describe('toSafeUrl', () => {
  it('keeps origin and path and drops query and fragment', () => {
    expect(toSafeUrl('https://bank.test/login?token=abc#x')).toBe('https://bank.test/login')
  })

  it('refuses schemes that are not http(s)', () => {
    expect(toSafeUrl('chrome-extension://abc/page.html')).toBeNull()
    expect(toSafeUrl('javascript:alert(1)')).toBeNull()
  })

  it('returns null instead of throwing on nonsense', () => {
    expect(toSafeUrl('not a url')).toBeNull()
    expect(toSafeUrl(undefined)).toBeNull()
  })
})

describe('one adapter, both browsers', () => {
  for (const kind of ['chrome', 'firefox'] as const) {
    it(`round-trips storage on ${kind}`, async () => {
      const platform = createPlatform(kind, fakeApi())
      await platform.storage.set('quietMode', true)
      expect(await platform.storage.get<boolean>('quietMode')).toBe(true)
      await platform.storage.remove('quietMode')
      expect(await platform.storage.get<boolean>('quietMode')).toBeUndefined()
    })

    it(`strips the query from the active tab url on ${kind}`, async () => {
      const platform = createPlatform(kind, fakeApi())
      expect(await platform.tabs.activeUrl()).toBe('https://example.test/a/b')
    })
  }
})

describe('rpc survives what it does not understand', () => {
  it('answers unsupported for a malformed message instead of throwing', () => {
    const listeners: Array<(m: unknown, s: unknown, r: (x: unknown) => void) => void> = []
    const api = fakeApi({
      runtime: {
        sendMessage: vi.fn(),
        onMessage: {
          addListener: (cb) => {
            listeners.push(cb)
          },
        },
      },
    })
    const platform = createPlatform('chrome', api)
    platform.runtime.onMessage(() => undefined)

    const answers: unknown[] = []
    listeners[0]?.({ nonsense: true }, null, (response) => answers.push(response))
    listeners[0]?.({ v: 2, type: 'page/candidates' }, null, (response) => answers.push(response))

    expect(answers).toEqual([
      { v: 1, error: 'unsupported' },
      { v: 1, error: 'unsupported' },
    ])
  })

  it('wraps an outgoing call in a versioned envelope', async () => {
    const sendMessage = vi.fn(async (_message: unknown) => ({ ok: true }))
    const api = fakeApi({ runtime: { sendMessage, onMessage: { addListener: vi.fn() } } })
    const platform = createPlatform('firefox', api)

    await platform.runtime.send('page/rescan', { frameId: 0 })

    const sent = sendMessage.mock.calls[0]?.[0] as Envelope<'page/rescan'>
    expect(sent).toEqual({ v: 1, type: 'page/rescan', payload: { frameId: 0 } })
  })
})
