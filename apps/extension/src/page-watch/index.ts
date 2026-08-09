/**
 * What the page sends while a finding on it is still unresolved.
 *
 * The agent gate holds navigational actions — forms, links, controls inside a
 * form — because those are what a browser agent driving Chrome actually causes.
 * It cannot hold a request the page makes itself: a content script runs in an
 * isolated world and never sees the page's own `fetch`, MV3 has no blocking
 * `webRequest`, and `declarativeNetRequest` is declarative and cannot ask a
 * person anything. The only vantage point is inside the page, and this is it.
 *
 * **It observes and never holds.** Every wrapper here calls through
 * immediately and returns exactly what the original returned. Hanging another
 * site's requests on our judgement is how an extension becomes the thing that
 * broke the web — and a page determined to avoid this can capture `fetch`
 * before we do anyway, so holding would buy an overstated promise rather than
 * a real one.
 *
 * What it is worth: a user whose page moved money while a hidden instruction
 * sat unresolved on it can find that out. That is a record, not a guard, and
 * the journal says so in those words.
 *
 * Two limits, stated rather than papered over:
 *
 *   - the channel is `window.postMessage`, which the page can also post on, so
 *     a hostile page can add entries that did not happen. It cannot remove the
 *     real ones, and the cost of a forged journal line is noise, not silence;
 *   - a page that caches `fetch` before this script runs is not seen. Running
 *     at `document_start` wins the ordinary race and loses the determined one.
 */

/** Nothing is watched until the isolated world says a finding is unresolved. */
const ARM = 'okolos:page-watch:arm'
const DISARM = 'okolos:page-watch:disarm'
const REPORT = 'okolos:page-watch:report'

export interface PageRequestReport {
  readonly method: string
  /** Host only. A query string carries the very thing this product protects. */
  readonly host: string
}

/**
 * Host alone, and nothing at all when the URL will not parse.
 *
 * The base is passed in rather than read off the ambient `location`: in
 * production they are the same object, but a seam that only works because the
 * global happens to be right is a seam nothing can check.
 */
function hostOf(input: unknown, base: string): string | null {
  try {
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input instanceof Request
            ? input.url
            : null
    if (raw === null) return null
    return new URL(raw, base).host
  } catch {
    return null
  }
}

/**
 * GET and HEAD are how a page reads. Everything else is how it changes
 * something, and only that is worth a line in someone's journal.
 */
function changesSomething(method: string): boolean {
  const verb = method.toUpperCase()
  return verb !== 'GET' && verb !== 'HEAD'
}

function report(
  win: Window & typeof globalThis,
  armed: () => boolean,
  method: string,
  host: string | null,
): void {
  if (!armed() || host === null) return
  try {
    win.postMessage({ source: REPORT, method: method.toUpperCase(), host }, '*')
  } catch {
    // A page can make postMessage throw by other means. Reporting is the
    // optional half of this file; the request itself must be untouched.
  }
}

export function watchPage(win: Window & typeof globalThis): void {
  /**
   * Per call, not per module. In the extension `watchPage` runs once in each
   * world, so a module-level flag would have behaved identically — and it was
   * a shared global that two watchers could not have told apart, which is the
   * kind of seam that is fine until the day it is not.
   */
  let armed = false
  const isArmed = (): boolean => armed

  const originalFetch = win.fetch
  const originalSend = win.XMLHttpRequest?.prototype?.send
  const originalOpen = win.XMLHttpRequest?.prototype?.open

  if (typeof originalFetch === 'function') {
    win.fetch = function patched(this: unknown, ...args: Parameters<typeof fetch>) {
      // Read first, call second, and never let a failure here change what the
      // page gets. The call is not awaited, delayed or conditioned on us.
      try {
        const [input, init] = args
        const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
        if (changesSomething(method)) report(win, isArmed, method, hostOf(input, win.location.href))
      } catch {
        /* observation is best-effort; the request is not */
      }
      return originalFetch.apply(this as never, args)
    } as typeof fetch
  }

  if (typeof originalSend === 'function' && typeof originalOpen === 'function') {
    const seen = new WeakMap<XMLHttpRequest, { method: string; host: string | null }>()
    win.XMLHttpRequest.prototype.open = function patchedOpen(
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      try {
        seen.set(this, { method, host: hostOf(url, win.location.href) })
      } catch {
        /* as above */
      }
      return (originalOpen as (...a: unknown[]) => unknown).call(this, method, url, ...rest)
    } as typeof XMLHttpRequest.prototype.open

    win.XMLHttpRequest.prototype.send = function patchedSend(this: XMLHttpRequest, ...rest: unknown[]) {
      try {
        const record = seen.get(this)
        if (record && changesSomething(record.method)) report(win, isArmed, record.method, record.host)
      } catch {
        /* as above */
      }
      return (originalSend as (...a: unknown[]) => unknown).call(this, ...rest)
    } as typeof XMLHttpRequest.prototype.send
  }

  win.addEventListener('message', (event: MessageEvent) => {
    // Only this window: a frame must not arm its parent's watcher.
    if (event.source !== win) return
    const data = event.data as { source?: unknown } | null
    if (data?.source === ARM) armed = true
    if (data?.source === DISARM) armed = false
  })
}

watchPage(window)
