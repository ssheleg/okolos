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
  readonly inference: Inference
  readonly blocking: Blocking
}

/** Network-level blocking, which is the only kind that happens before render. */
export interface Blocking {
  /** Replaces every rule this extension owns. Partial updates drift. */
  replaceRules(rules: readonly unknown[]): Promise<void>
  /** Fires with the URL that was redirected to our interstitial. */
  onBlocked(handler: (url: string) => void): void
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
  /** Fires once, on a fresh install — not on updates or browser restarts. */
  onInstalled(handler: () => void): void
  /** Absolute URL of a file inside the extension package. */
  getUrl(path: string): string
  openOptionsPage(): Promise<void>
}

/** Where a model is allowed to run in this browser. */
export type InferenceHostKind = 'offscreen' | 'background' | 'none'

export interface Inference {
  /**
   * Makes sure a context exists that can run a model, and says which one it is.
   *
   * Chrome's service worker has no DOM and no WebGPU, so inference needs an
   * offscreen document; Firefox keeps a background page and can run it there.
   * `none` is a real answer — a browser that offers neither must be told apart
   * from one where the model simply has not been fetched yet.
   */
  ensureHost(): Promise<InferenceHostKind>
}

export interface Tabs {
  /** Origin and path only — the same rule the collector obeys. */
  activeUrl(): Promise<string | null>
  create(url: string): Promise<void>
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
    getURL(path: string): string
    openOptionsPage?(): Promise<void> | void
    onInstalled: { addListener(cb: (details: { reason: string }) => void): void }
    sendMessage(message: unknown): Promise<unknown>
    onMessage: {
      addListener(
        cb: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void,
      ): void
    }
  }
  tabs: {
    query(info: { active: true; currentWindow: true }): Promise<Array<{ url?: string }>>
    create(info: { url: string }): Promise<unknown> | void
  }
  declarativeNetRequest?: {
    getDynamicRules(): Promise<Array<{ id: number }>>
    updateDynamicRules(update: {
      removeRuleIds?: number[]
      addRules?: unknown[]
    }): Promise<void>
    onRuleMatchedDebug?: {
      addListener(cb: (info: { request: { url: string } }) => void): void
    }
  }
  webNavigation?: {
    onBeforeNavigate: {
      addListener(
        cb: (details: { url: string; frameId: number }) => void,
        filter?: unknown,
      ): void
    }
  }
  /** Chrome only. Absent in Firefox, which runs the model on its background page. */
  offscreen?: {
    hasDocument(): Promise<boolean>
    createDocument(info: {
      url: string
      reasons: string[]
      justification: string
    }): Promise<void>
  }
}
