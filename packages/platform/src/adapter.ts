import { isEnvelope, type Envelope, type RpcMap, type RpcType } from '@okolos/contracts'

import type { Platform, RpcHandler, WebExtensionApi } from './types.js'

/**
 * Strips a URL down to origin and path.
 *
 * Query strings and fragments carry session tokens and reset links. They are
 * removed here, at the boundary, rather than trusted to be removed by every
 * caller downstream — a rule enforced in one place is a rule.
 */
export function toSafeUrl(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return `${url.origin}${url.pathname}`
  } catch {
    return null
  }
}

/**
 * Both browsers are built from the same adapter: the differences that matter
 * to this product (worker vs page, offscreen vs direct inference) live in the
 * extension composition, not in these calls.
 */
export function createPlatform(kind: Platform['kind'], api: WebExtensionApi): Platform {
  // Resolved lazily and cached: `getSelf` is async, and every caller of
  // `selfId` is on a path that must not await for it.
  let selfExtensionId = ''
  void api.management?.getSelf().then((self) => {
    selfExtensionId = self.id
  })

  return {
    kind,

    storage: {
      async get<T>(key: string): Promise<T | undefined> {
        const result = await api.storage.local.get(key)
        return result[key] as T | undefined
      },
      async set(key: string, value: unknown): Promise<void> {
        await api.storage.local.set({ [key]: value })
      },
      async remove(key: string): Promise<void> {
        await api.storage.local.remove(key)
      },
    },

    alarms: {
      async create(name: string, periodInMinutes: number): Promise<void> {
        api.alarms.create(name, { periodInMinutes })
      },
      onFired(handler: (name: string) => void): void {
        api.alarms.onAlarm.addListener((alarm) => {
          handler(alarm.name)
        })
      },
    },

    runtime: {
      async send<T extends RpcType>(type: T, payload: RpcMap[T]['req']): Promise<RpcMap[T]['res']> {
        const envelope: Envelope<T> = { v: 1, type, payload }
        return (await api.runtime.sendMessage(envelope)) as RpcMap[T]['res']
      },
      onInstalled(handler: () => void): void {
        api.runtime.onInstalled.addListener((details) => {
          if (details.reason === 'install') handler()
        })
      },

      getUrl(path: string): string {
        return api.runtime.getURL(path)
      },

      async openOptionsPage(): Promise<void> {
        await api.runtime.openOptionsPage?.()
      },

      onMessage(handler: RpcHandler): void {
        api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
          // An unknown type or a future version is answered and survived. A
          // receiver that throws here turns a version skew into a broken page.
          if (!isEnvelope(message)) {
            sendResponse({ v: 1, error: 'unsupported' })
            return true
          }

          const result = handler(message)
          if (!result) {
            sendResponse({ v: 1, error: 'unsupported' })
            return true
          }

          result.then(sendResponse, (cause: unknown) => {
            sendResponse({ v: 1, error: 'failed', detail: String(cause) })
          })
          return true
        })
      },
    },

    extensions: {
      available: () => Boolean(api.management),

      async list() {
        const all = (await api.management?.getAll()) ?? []
        return all.map((entry) => ({
          id: entry.id,
          name: entry.name,
          version: entry.version,
          permissions: entry.permissions ?? [],
          hostPermissions: entry.hostPermissions ?? [],
          // The store does not expose an author field, so the update URL is
          // the closest thing to "who ships this" the browser will tell us —
          // and a change of it is exactly the event worth reporting.
          publisher: entry.updateUrl ?? entry.installType ?? null,
          enabled: entry.enabled,
        }))
      },

      async disable(id: string): Promise<void> {
        await api.management?.setEnabled(id, false)
      },

      selfId: () => selfExtensionId,
    },

    downloads: {
      available: () => Boolean(api.downloads),

      onCreated(handler): void {
        api.downloads?.onCreated.addListener((item) => {
          handler({
            id: item.id,
            url: item.url,
            filename: (item.filename ?? '').split(/[\\/]/).pop() ?? '',
            mime: item.mime ?? null,
          })
        })
      },

      async cancel(id: number): Promise<void> {
        await api.downloads?.cancel(id)
      },
    },

    blocking: {
      async replaceRules(rules: readonly unknown[]): Promise<void> {
        const dnr = api.declarativeNetRequest
        if (!dnr) return

        // Every rule replaced at once, never patched. A partial update leaves
        // rules from a feed version nobody can name any more.
        const existing = await dnr.getDynamicRules()
        await dnr.updateDynamicRules({
          removeRuleIds: existing.map((rule) => rule.id),
          addRules: [...rules],
        })
      },

      onBlocked(handler: (url: string) => void): void {
        // The navigation that is about to be redirected is the only place the
        // original URL is still visible: after the redirect the tab shows our
        // own page and the target is gone.
        api.webNavigation?.onBeforeNavigate.addListener((details) => {
          if (details.frameId !== 0) return
          handler(details.url)
        })
      },
    },

    inference: {
      async ensureHost(): Promise<'offscreen' | 'background' | 'none'> {
        // Firefox has no offscreen API and does not need one: its background
        // context is a page with a DOM.
        if (kind === 'firefox') return 'background'
        if (!api.offscreen) return 'none'

        if (!(await api.offscreen.hasDocument())) {
          await api.offscreen.createDocument({
            url: api.runtime.getURL('offscreen.html'),
            // WORKERS is the closest honest reason on Chrome's fixed list: the
            // document exists to host a WASM/WebGPU worker, nothing else.
            reasons: ['WORKERS'],
            justification: 'Runs the local hidden-instruction classifier.',
          })
        }
        return 'offscreen'
      },
    },

    tabs: {
      async activeUrl(): Promise<string | null> {
        const [tab] = await api.tabs.query({ active: true, currentWindow: true })
        return toSafeUrl(tab?.url)
      },

      async create(url: string): Promise<void> {
        await api.tabs.create({ url })
      },
    },
  }
}
