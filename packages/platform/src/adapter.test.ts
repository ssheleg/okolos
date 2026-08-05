import { describe, expect, it, vi } from 'vitest'
import type { Envelope } from '@okolos/contracts'

import { createPlatform, toSafeUrl } from './adapter.js'
import type { WebExtensionApi } from './types.js'

/**
 * Each section may be stubbed on its own; the rest keeps working. `offscreen`
 * is the exception: it has no base to merge into, so a test that wants one
 * supplies the whole thing.
 */
type OptionalSection = 'offscreen' | 'declarativeNetRequest' | 'webNavigation'
type ApiOverrides = {
  [K in Exclude<keyof WebExtensionApi, OptionalSection>]?: Partial<WebExtensionApi[K]>
} & { [K in OptionalSection]?: WebExtensionApi[K] }

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
  const { offscreen, declarativeNetRequest, webNavigation, ...sections } = overrides
  return {
    ...base,
    ...sections,
    ...(offscreen ? { offscreen } : {}),
    ...(declarativeNetRequest ? { declarativeNetRequest } : {}),
    ...(webNavigation ? { webNavigation } : {}),
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

describe('where a model may run', () => {
  it('uses an offscreen document in Chrome, because a worker has no DOM', async () => {
    const created: unknown[] = []
    const platform = createPlatform('chrome', fakeApi({
      offscreen: {
        hasDocument: async () => false,
        createDocument: async (info) => {
          created.push(info)
        },
      },
    }))

    await expect(platform.inference.ensureHost()).resolves.toBe('offscreen')
    expect(created).toHaveLength(1)
  })

  it('does not create a second offscreen document when one is already there', async () => {
    const createDocument = vi.fn(async () => undefined)
    const platform = createPlatform('chrome', fakeApi({
      offscreen: { hasDocument: async () => true, createDocument },
    }))

    await expect(platform.inference.ensureHost()).resolves.toBe('offscreen')
    expect(createDocument).not.toHaveBeenCalled()
  })

  it('runs on the background page in Firefox, which has one', async () => {
    const platform = createPlatform('firefox', fakeApi())
    await expect(platform.inference.ensureHost()).resolves.toBe('background')
  })

  it('says plainly when there is nowhere to run a model at all', async () => {
    // Distinct from "the model has not been fetched": one is a device fact, the
    // other is a state the user can change.
    const platform = createPlatform('chrome', fakeApi())
    await expect(platform.inference.ensureHost()).resolves.toBe('none')
  })
})

describe('blocking before the page renders', () => {
  it('replaces every rule it owns rather than patching', async () => {
    // A partial update leaves rules from a feed version nobody can name.
    const updates: unknown[] = []
    const platform = createPlatform('chrome', fakeApi({
      declarativeNetRequest: {
        getDynamicRules: async () => [{ id: 1 }, { id: 2 }],
        updateDynamicRules: async (update) => {
          updates.push(update)
        },
      },
    }))

    await platform.blocking.replaceRules([{ id: 9 }])
    expect(updates[0]).toMatchObject({ removeRuleIds: [1, 2], addRules: [{ id: 9 }] })
  })

  it('does nothing, quietly, where the browser has no such API', async () => {
    const platform = createPlatform('firefox', fakeApi())
    await expect(platform.blocking.replaceRules([{ id: 1 }])).resolves.toBeUndefined()
  })

  it('reports the URL of a top-level navigation, which is the only place it survives', () => {
    // Held in an object: assigned inside a callback, TypeScript narrows a bare
    // `let` to never and the call below stops type-checking.
    const held: { fire?: (details: { url: string; frameId: number }) => void } = {}
    const platform = createPlatform('chrome', fakeApi({
      webNavigation: {
        onBeforeNavigate: {
          addListener: (cb) => {
            held.fire = cb
          },
        },
      },
    }))

    const seen: string[] = []
    platform.blocking.onBlocked((url) => seen.push(url))
    held.fire?.({ url: 'https://bad.test/login', frameId: 0 })
    expect(seen).toEqual(['https://bad.test/login'])
  })

  it('ignores subframe navigations, which are not the page being blocked', () => {
    const held: { fire?: (details: { url: string; frameId: number }) => void } = {}
    const platform = createPlatform('chrome', fakeApi({
      webNavigation: { onBeforeNavigate: { addListener: (cb) => { held.fire = cb } } },
    }))

    const seen: string[] = []
    platform.blocking.onBlocked((url) => seen.push(url))
    held.fire?.({ url: 'https://ads.test/frame', frameId: 3 })
    expect(seen).toEqual([])
  })
})
