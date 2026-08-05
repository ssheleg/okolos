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

    tabs: {
      async activeUrl(): Promise<string | null> {
        const [tab] = await api.tabs.query({ active: true, currentWindow: true })
        return toSafeUrl(tab?.url)
      },
    },
  }
}
