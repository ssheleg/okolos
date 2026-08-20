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
  readonly enabled: boolean
}

export type ChangeKind =
  | 'permission-added'
  | 'host-access-widened'
  | 'publisher-changed'
  | 'newly-installed'
  | 'removed'

export interface InventoryChange {
  readonly kind: ChangeKind
  readonly id: string
  readonly name: string
  /** One sentence, in the words the user will see. */
  readonly detail: string
  readonly severity: 'critical' | 'major' | 'minor'
}

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
        detail: `${current.name} was added since the last check.`,
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
        detail: `${current.name} is now published by ${current.publisher ?? 'an unnamed party'}, previously ${old.publisher ?? 'an unnamed party'}.`,
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
        detail: `${current.name} now asks for ${added.join(', ')}, which it did not before.`,
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
        detail: `${current.name} can now read ${widened.join(', ')}.`,
        severity: widened.some(isEverywhere) ? 'critical' : 'major',
      })
    }
  }

  for (const gone of previous.values()) {
    changes.push({
      kind: 'removed',
      id: gone.id,
      name: gone.name,
      detail: `${gone.name} is no longer installed.`,
      severity: 'minor',
    })
  }

  return changes
}

function isEverywhere(host: string): boolean {
  return host === '<all_urls>' || /^\*:\/\/\*\//.test(host) || /^https?:\/\/\*\/\*$/.test(host)
}
