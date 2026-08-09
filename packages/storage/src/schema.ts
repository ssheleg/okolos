import type { DBSchema } from 'idb'
import type { AuditEntry, Verdict } from '@okolos/contracts'

export const DB_NAME = 'okolos'
export const DB_VERSION = 4

/**
 * Retention windows in days. They are short on purpose: a security tool that
 * accumulates a year of your browsing is the thing this product exists
 * against, and a window nobody can state is a window nobody enforces.
 */
export const RETENTION_DAYS = {
  journal: 90,
  outbound_log: 90,
  /** Counted from the moment the user resolved it, not from when it appeared. */
  resolvedFinding: 30,
} as const

export const STORES = [
  'findings',
  'journal',
  'outbound_log',
  'exceptions',
  'settings',
  'snapshots',
  'models',
  'feeds',
  'reuse',
] as const

export type StoreName = (typeof STORES)[number]

export interface FindingRecord {
  id: string
  createdAt: string
  /** `page:<origin+path>` — the subject as the verdict named it. */
  subject: string
  /** ISO timestamp when the user handled it; null while it still needs them. */
  resolvedAt: string | null
  verdict?: Verdict
}

export interface JournalRecord {
  id: string
  createdAt: string
  kind: 'verdict' | 'action' | 'error' | 'detector-disabled'
  /**
   * `readonly string[]` is here for `explainArgs`.
   *
   * A journal entry stores what happened, not a sentence about it: a key and
   * its substitutions, resolved when the entry is read so the reader's language
   * decides rather than the language in force when the event occurred.
   */
  detail?: Readonly<Record<string, string | number | boolean | readonly string[]>>
}

export interface ExceptionRecord {
  scope: 'domain' | 'rule' | 'extension'
  ref: string
  createdAt: string
  /**
   * A catalogue key, resolved when the row is read, so the reader's language
   * decides rather than the language in force when they clicked. The same
   * shape the journal already uses for `explainKey`.
   */
  reasonKey?: string
  /**
   * A sentence stored before that move. It stays as written — rewriting it to
   * look translated would be inventing which key it came from, and the trusted
   * list is a record of decisions, not a place to guess.
   */
  reason?: string
}

export interface SettingRecord {
  key: string
  value: string | number | boolean | null
}

/**
 * Classifier weights, kept whole rather than re-fetched.
 *
 * They live beside everything else so a wipe takes them too: a user who erases
 * their data would not expect a few dozen megabytes of downloaded model to
 * survive it.
 */
export interface ModelRecord {
  /** `<id>@<version>` — a version bump is a different row, never an overwrite. */
  key: string
  id: string
  version: string
  bytes: ArrayBuffer
  storedAt: string
}

/** The last verified snapshot of a feed, one row per feed name. */
export interface FeedRecord {
  name: string
  version: number
  updatedAt: string
  storedAt: string
  entries: string[]
}

/**
 * One password tag seen on one host.
 *
 * The tag is an HMAC over the digest the leak check already computes, keyed by
 * a random value generated on this device and never synchronised. It is not
 * reversible to a password without that key, and the key is wiped with
 * everything else — a device where it is readable is a device whose browser
 * password store is readable too, which is strictly more than this.
 *
 * `seenAt` is the **first** time this tag was recorded for this host, not the
 * latest: refreshing it on every login would make the index a record of when
 * the user last visited a site, which is browsing history under another name.
 */
export interface ReuseRecord {
  tag: string
  host: string
  seenAt: string
}

export interface SnapshotRecord {
  extensionId: string
  takenAt: string
  version: string
  permissions: readonly string[]
  publisher?: string
}

export interface OkolosDB extends DBSchema {
  findings: { key: string; value: FindingRecord; indexes: { 'by-created': string; 'by-subject': string } }
  journal: { key: string; value: JournalRecord; indexes: { 'by-created': string; 'by-kind': string } }
  outbound_log: { key: string; value: AuditEntry; indexes: { 'by-created': string; 'by-purpose': string } }
  exceptions: { key: [string, string]; value: ExceptionRecord; indexes: { 'by-created': string } }
  settings: { key: string; value: SettingRecord }
  models: { key: string; value: ModelRecord; indexes: { 'by-id': string } }
  feeds: { key: string; value: FeedRecord }
  snapshots: { key: string; value: SnapshotRecord }
  reuse: { key: [string, string]; value: ReuseRecord; indexes: { 'by-tag': string } }
}
