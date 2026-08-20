import { openDB, deleteDB, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb'

import { DB_NAME, DB_VERSION, type OkolosDB } from './schema.js'

export type OkolosDatabase = IDBPDatabase<OkolosDB>

let handle: OkolosDatabase | null = null

/**
 * Why the local store cannot be used, in a form a screen can act on.
 *
 * The one that matters is `from-a-newer-version`. A profile written by a later
 * build answers every `openDB` call with a `VersionError`, and no line in this
 * repository recognised it: the product simply stopped, six panels deep, each
 * rendering the browser's own sentence about requested and existing versions.
 * That happens on an ordinary enterprise rollback and on Chrome reverting an
 * update, and the user has no way to tell it from "the database broke" — which
 * has a different remedy.
 *
 * Refusing to open is the right answer, not a fallback: the newer build may have
 * added a store, an index or a field this one does not know, and writing into a
 * schema we cannot describe is how a downgrade turns into data loss.
 */
export type StorageProblem =
  | 'from-a-newer-version'
  /**
   * The profile opened, and is not the shape this build needs.
   *
   * IndexedDB only changes a schema inside a version-change transaction, so a
   * store or an index missing from a profile **already at the current version**
   * cannot be added — `upgrade` does not run, and nothing else may create
   * anything. Measured while writing the upgrade tests: a profile at version 4
   * whose `reuse` store had no `by-tag` index stayed that way, and the query it
   * serves ("where else was this password used") would have answered nothing,
   * quietly and forever.
   *
   * So the shape is verified after opening and a mismatch is named. Wrong is
   * better than silent, and the remedy is real: reset, or install the build that
   * made the profile.
   */
  | 'shape-incomplete'
  | 'blocked'
  | 'unknown'

export class StorageUnavailable extends Error {
  constructor(
    readonly problem: StorageProblem,
    /** The version found in the profile, when it could be read. */
    readonly found: number | null,
    cause?: unknown,
  ) {
    // i18n-exempt: an `Error.message`, and no screen renders it — the storage panel
    // shows the browser's own `cause.message` or omits the line; this text reaches a
    // console and a bug report, where `problem` is the part anyone acts on
    super(`okolos: the local store cannot be opened (${problem})`)
    this.name = 'StorageUnavailable'
    this.cause = cause
  }
}

/** The version the profile actually holds, or `null` if it has none yet. */
export async function storedVersion(): Promise<number | null> {
  // Opening with no version returns whatever is there and never upgrades, which
  // is the only way to ask the question without answering it destructively.
  try {
    const existing = await openDB(DB_NAME)
    const version = existing.version
    existing.close()
    return version > 0 ? version : null
  } catch {
    return null
  }
}

/**
 * Deletes the local store outright.
 *
 * The recovery path for a profile this build cannot open, and the reason it is
 * separate from `wipeAll`: that one needs a connection, and the case it would be
 * needed for is exactly the case where there is none. Destructive and named as
 * such — the screen that offers it says what goes.
 */
export async function resetStorage(): Promise<void> {
  closeDb()
  await deleteDB(DB_NAME, {
    blocked() {
      // Another context still holds a connection. Nothing to do but wait for it
      // to close; reporting progress here would be a promise we cannot keep.
    },
  })
}

/**
 * Every store this build needs, with its key path and its indexes.
 *
 * One table instead of a version ladder. The ladder said "if the profile is
 * below 2, add models; below 3, add feeds" and fell through to a
 * create-everything branch whose first statement threw the moment any store
 * already existed — so a profile that had been upgraded halfway, or one whose
 * `findings` store was missing for any reason, aborted the whole transaction and
 * left the product with no database at all. "Create what is missing" describes
 * both an install and an upgrade, and cannot be got wrong per version.
 */
const SHAPE = [
  { name: 'findings', keyPath: 'id', indexes: [['by-created', 'createdAt'], ['by-subject', 'subject']] },
  { name: 'journal', keyPath: 'id', indexes: [['by-created', 'createdAt'], ['by-kind', 'kind']] },
  { name: 'outbound_log', keyPath: 'id', indexes: [['by-created', 'createdAt'], ['by-purpose', 'purpose']] },
  { name: 'exceptions', keyPath: ['scope', 'ref'], indexes: [['by-created', 'createdAt']] },
  { name: 'settings', keyPath: 'key', indexes: [] },
  { name: 'snapshots', keyPath: 'extensionId', indexes: [] },
  { name: 'models', keyPath: 'key', indexes: [['by-id', 'id']] },
  { name: 'feeds', keyPath: 'name', indexes: [] },
  // Keyed by [tag, host] so one password on one site is one row however often it
  // is submitted, and indexed by tag so "where else" is a lookup rather than a
  // scan of everything the user has ever typed a password into.
  { name: 'reuse', keyPath: ['tag', 'host'], indexes: [['by-tag', 'tag']] },
] as const satisfies ReadonlyArray<{
  name: StoreNames<OkolosDB>
  keyPath: string | readonly string[]
  indexes: ReadonlyArray<readonly [string, string]>
}>

/**
 * Brings the profile up to the shape above, adding only what is absent.
 *
 * Indexes are checked too, and separately: a store can exist without one, and an
 * index missing from an existing store is exactly what a half-finished upgrade
 * leaves behind. `by-tag` absent would make "where else was this password used"
 * a full scan that silently returns nothing.
 */
function ensureShape(
  db: IDBPDatabase<OkolosDB>,
  tx: IDBPTransaction<OkolosDB, ArrayLike<StoreNames<OkolosDB>>, 'versionchange'>,
): void {
  for (const store of SHAPE) {
    if (!db.objectStoreNames.contains(store.name)) {
      db.createObjectStore(store.name, { keyPath: store.keyPath as string | string[] })
    }
    /**
     * The store may predate this build, so its indexes are asked for by name
     * rather than assumed from the fact that it exists.
     *
     * Reached as a raw `IDBObjectStore`: `idb`'s typed `createIndex` wants the
     * index names declared for *that* store, and iterating over a union of stores
     * narrows the parameter to `never`. The cast buys nothing that a type would
     * have caught — `db.test.ts` reads the built database back and compares its
     * stores and indexes to this table, which is a stronger claim than a
     * signature: it says the profile actually has them.
     */
    const existing = tx.objectStore(store.name) as unknown as IDBObjectStore
    for (const [index, on] of store.indexes) {
      if (!existing.indexNames.contains(index)) existing.createIndex(index, on)
    }
  }
}

/**
 * One connection per context. The background worker is torn down and restarted
 * by the browser at will, so nothing may live in memory between calls — but
 * within a single wake-up, reopening on every read would be wasteful.
 */
export async function openDb(): Promise<OkolosDatabase> {
  if (handle) return handle

  try {
    handle = await openDB<OkolosDB>(DB_NAME, DB_VERSION, {
      upgrade(db, _from, _to, tx) {
        ensureShape(db, tx)
      },
      /**
       * Another context in this profile is holding a connection open at the old
       * version, so our upgrade cannot start. Nothing here can close theirs; what
       * this must not do is hang forever pretending to work, so the caller is
       * told which of the two problems it has.
       */
      blocked() {
        handle = null
      },
      /**
       * Somebody else is upgrading and we are the old connection in their way.
       * Closing is the cooperative answer — the alternative is blocking a newer
       * build from ever starting, which is the mirror image of the defect above.
       */
      blocking() {
        closeDb()
      },
      /**
       * The browser closed the connection: storage pressure, a profile reset, or
       * the user clearing site data. The cached handle was kept forever, so every
       * call after that used a dead connection and failed for a reason that named
       * nothing. Dropping it means the next call reopens.
       */
      terminated() {
        handle = null
      },
    })
  } catch (cause) {
    handle = null
    if (isVersionError(cause)) {
      throw new StorageUnavailable('from-a-newer-version', await storedVersion(), cause)
    }
    throw new StorageUnavailable('unknown', null, cause)
  }

  const missing = whatIsMissing(handle)
  if (missing.length > 0) {
    const version = handle.version
    closeDb()
    throw new StorageUnavailable('shape-incomplete', version, new Error(missing.join('; ')))
  }

  return handle
}

/**
 * What the opened profile does not have, compared with `SHAPE`.
 *
 * Checked on every fresh open rather than trusted from the upgrade, because the
 * upgrade cannot run on a profile already at this version — and that is exactly
 * the profile a half-finished upgrade leaves. Nine name reads and, where a store
 * has indexes, one transaction each: cheap next to the first query, and it turns
 * a silently wrong answer into a named one.
 */
function whatIsMissing(db: OkolosDatabase): string[] {
  const gaps: string[] = []
  for (const store of SHAPE) {
    if (!db.objectStoreNames.contains(store.name)) {
      gaps.push(`store ${store.name}`)
      continue
    }
    if (store.indexes.length === 0) continue
    const opened = db.transaction(store.name).store as unknown as IDBObjectStore
    for (const [index] of store.indexes) {
      if (!opened.indexNames.contains(index)) gaps.push(`index ${store.name}.${index}`)
    }
  }
  return gaps
}

/**
 * A profile written by a later build, recognised by name.
 *
 * `DOMException.name` is the contract here — the message is a browser's wording
 * and differs between them, and this product ships on two.
 */
function isVersionError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'VersionError'
}

export function closeDb(): void {
  handle?.close()
  handle = null
}
