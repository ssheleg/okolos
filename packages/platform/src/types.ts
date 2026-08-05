import type { Envelope, RpcMap, RpcType } from '@okolos/contracts'

/**
 * The surface the rest of the product is allowed to see.
 *
 * Everything that differs between Chrome and Firefox is absorbed here: Chrome
 * runs a service worker with no DOM and needs an offscreen document to run
 * inference, Firefox keeps a background page and a blocking webRequest. A
 * detector that knew any of that would have to be rewritten per browser; one
 * that takes candidates and returns verdicts does not.
 */
export interface Platform {
  readonly kind: 'chrome' | 'firefox'
  readonly storage: KeyValueStore
  readonly alarms: Alarms
  readonly runtime: Runtime
  readonly tabs: Tabs
}

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

export interface Alarms {
  create(name: string, periodInMinutes: number): Promise<void>
  onFired(handler: (name: string) => void): void
}

export type RpcHandler = <T extends RpcType>(
  message: Envelope<T>,
) => Promise<RpcMap[T]['res']> | undefined

export interface Runtime {
  send<T extends RpcType>(type: T, payload: RpcMap[T]['req']): Promise<RpcMap[T]['res']>
  onMessage(handler: RpcHandler): void
}

export interface Tabs {
  /** Origin and path only — the same rule the collector obeys. */
  activeUrl(): Promise<string | null>
}

/** The subset of the WebExtension API both browsers actually agree on. */
export interface WebExtensionApi {
  storage: {
    local: {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>
      set(items: Record<string, unknown>): Promise<void>
      remove(keys: string | string[]): Promise<void>
    }
  }
  alarms: {
    create(name: string, info: { periodInMinutes: number }): void
    onAlarm: { addListener(cb: (alarm: { name: string }) => void): void }
  }
  runtime: {
    sendMessage(message: unknown): Promise<unknown>
    onMessage: {
      addListener(
        cb: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void,
      ): void
    }
  }
  tabs: {
    query(info: { active: true; currentWindow: true }): Promise<Array<{ url?: string }>>
  }
}
