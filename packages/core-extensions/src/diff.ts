/**
 * What changed about the extensions already installed.
 *
 * The dangerous moment for a browser extension is not installation — the user
 * was there and chose it — but the update three months later that adds a
 * permission or arrives from a new owner. Both are invisible in every browser's
 * own interface, and both are exactly how a well-reviewed extension becomes a
 * data pipe.
 *
 * So the comparison is against what was recorded last time, not against a
 * catalogue: what matters is that *this* extension changed under *this* user.
 */

export interface ExtensionSnapshot {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly permissions: readonly string[]
  /**
   * The hosts it can read, or `null` for "nobody recorded them".
   *
   * Only a snapshot restored from storage can be `null`, and only one written
   * before the field existed. The browser always tells us, so `after` is never
   * null — but `before` can be, and the two must not be confused: read as an
   * empty list, a stored row with no host permissions made every extension that
   * holds any look like it had just been granted them, `critical`, every run.
   * An absence is not a value to compare against.
   */
  readonly hostPermissions: readonly string[] | null
  readonly publisher: string | null
  /**
   * How it got here, as `chrome.management` reports it.
   *
   * Optional because a snapshot stored before this field existed has none, and "we did
   * not record it" is not "it came from the store" — the whole point of the signal.
   */
  readonly installType?: string
  readonly enabled: boolean
}

export type ChangeKind =
  | 'permission-added'
  | 'host-access-widened'
  | 'publisher-changed'
  | 'newly-installed'
  | 'removed'

/**
 * What changed, in values rather than in a sentence.
 *
 * Each kind used to arrive with `detail`: one finished English sentence, composed in a
 * package with no catalogue and shown to a reader whose interface is Russian (B-75).
 * The kind was already the code; what a sentence needs beyond it is the party, the
 * permissions or the hosts, and those are what travel now. `changeExplain` in
 * `@okolos/ui/words` is where they become words.
 *
 * A union rather than five optional fields: `host-access-widened` without its hosts is
 * a sentence with a hole in it, and the compiler should be the one to say so.
 */
export type InventoryChange = { readonly id: string; readonly name: string } & (
  | { readonly kind: 'newly-installed'; readonly severity: 'minor' }
  | { readonly kind: 'removed'; readonly severity: 'minor' }
  | {
      readonly kind: 'publisher-changed'
      readonly severity: 'critical'
      /** `null` where the store names no party — worded on the surface, not here. */
      readonly publisher: string | null
      readonly previousPublisher: string | null
    }
  | {
      readonly kind: 'permission-added'
      readonly severity: 'critical' | 'major'
      /** Manifest permission names. Identifiers the browser owns, never translated. */
      readonly permissions: readonly string[]
    }
  | {
      readonly kind: 'host-access-widened'
      readonly severity: 'critical' | 'major'
      /** Match patterns, as the manifest writes them. */
      readonly hosts: readonly string[]
    }
)

/** Permissions whose addition changes what an extension can do to the user. */
export const RISKY_PERMISSIONS: ReadonlySet<string> = new Set([
  'tabs',
  'webRequest',
  'webRequestBlocking',
  'cookies',
  'history',
  'bookmarks',
  'downloads',
  'management',
  'proxy',
  'debugger',
  'nativeMessaging',
  'clipboardRead',
  'privacy',
  'scripting',
])

export function diffInventory(
  before: readonly ExtensionSnapshot[],
  after: readonly ExtensionSnapshot[],
): InventoryChange[] {
  const previous = new Map(before.map((entry) => [entry.id, entry]))
  const changes: InventoryChange[] = []

  for (const current of after) {
    const old = previous.get(current.id)
    previous.delete(current.id)

    if (!old) {
      changes.push({
        kind: 'newly-installed',
        id: current.id,
        name: current.name,
        severity: 'minor',
      })
      continue
    }

    if (old.publisher !== current.publisher) {
      // The single strongest signal there is: the code is the same product to
      // the user and a different party's to everyone else.
      changes.push({
        kind: 'publisher-changed',
        id: current.id,
        name: current.name,
        publisher: current.publisher,
        previousPublisher: old.publisher,
        severity: 'critical',
      })
    }

    const added = current.permissions.filter((permission) => !old.permissions.includes(permission))
    const risky = added.filter((permission) => RISKY_PERMISSIONS.has(permission))
    if (added.length > 0) {
      changes.push({
        kind: 'permission-added',
        id: current.id,
        name: current.name,
        permissions: added,
        severity: risky.length > 0 ? 'critical' : 'major',
      })
    }

    // No comparison against an absence. A row from before host permissions were
    // stored says nothing about what this extension could read, and saying
    // "it can now read everything" on that basis is a false alarm every run.
    const knownBefore = old.hostPermissions
    const widened =
      knownBefore === null
        ? []
        : (current.hostPermissions ?? []).filter((host) => !knownBefore.includes(host))
    if (widened.length > 0) {
      changes.push({
        kind: 'host-access-widened',
        id: current.id,
        name: current.name,
        hosts: widened,
        severity: widened.some(isEverywhere) ? 'critical' : 'major',
      })
    }
  }

  for (const gone of previous.values()) {
    changes.push({
      kind: 'removed',
      id: gone.id,
      name: gone.name,
      severity: 'minor',
    })
  }

  return changes
}

function isEverywhere(host: string): boolean {
  return host === '<all_urls>' || /^\*:\/\/\*\//.test(host) || /^https?:\/\/\*\/\*$/.test(host)
}
