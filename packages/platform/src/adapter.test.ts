import { describe, expect, it, vi } from 'vitest'
import type { Envelope } from '@okolos/contracts'

import { createPlatform, toSafeUrl } from './adapter.js'
import type { WebExtensionApi } from './types.js'

/** Each section may be stubbed on its own; the rest keeps working. */
type ApiOverrides = { [K in keyof WebExtensionApi]?: Partial<WebExtensionApi[K]> }

function fakeApi(overrides: ApiOverrides = {}): WebExtensionApi {
  const store: Record<string, unknown> = {}
  const base: WebExtensionApi = {
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
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      openOptionsPage: vi.fn(async () => undefined),
      onInstalled: { addListener: vi.fn() },
      sendMessage: vi.fn(async () => ({ ok: true })),
      onMessage: { addListener: vi.fn() },
    },
    tabs: {
      query: async () => [{ url: 'https://example.test/a/b?token=secret#frag' }],
      create: vi.fn(async () => undefined),
    },
  }

  // Merged one level deep on purpose. With a flat spread, adding a capability
  // to Platform forced every test that stubs one runtime method to restate all
  // of them — churn that hides what each test actually cares about.
  return {
    ...base,
    ...overrides,
    runtime: { ...base.runtime, ...overrides.runtime },
    tabs: { ...base.tabs, ...overrides.tabs },
    storage: { ...base.storage, ...overrides.storage },
    alarms: { ...base.alarms, ...overrides.alarms },
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
    const api = fakeApi({ runtime: { sendMessage } })
    const platform = createPlatform('firefox', api)

    await platform.runtime.send('page/rescan', { frameId: 0 })

    const sent = sendMessage.mock.calls[0]?.[0] as Envelope<'page/rescan'>
    expect(sent).toEqual({ v: 1, type: 'page/rescan', payload: { frameId: 0 } })
  })
})

describe('install-time wiring goes through the adapter too', () => {
  it('fires the handler only on a fresh install, not on an update', () => {
    // Held in an array: TypeScript narrows a closed-over `let` to `never`
    // once it sees only the assignment inside the callback.
    const listeners: Array<(d: { reason: string }) => void> = []
    const api = fakeApi({
      runtime: {
        onInstalled: {
          addListener: (cb) => {
            listeners.push(cb)
          },
        },
      },
    })
    const platform = createPlatform('firefox', api)
    const onInstall = vi.fn()
    platform.runtime.onInstalled(onInstall)

    listeners[0]?.({ reason: 'update' })
    expect(onInstall).not.toHaveBeenCalled()
    listeners[0]?.({ reason: 'install' })
    expect(onInstall).toHaveBeenCalledOnce()
  })

  it('resolves a packaged file to an extension url', () => {
    const platform = createPlatform('chrome', fakeApi())
    expect(platform.runtime.getUrl('first-run.html')).toBe('chrome-extension://test/first-run.html')
  })
})
