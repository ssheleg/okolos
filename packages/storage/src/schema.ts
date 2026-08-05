import type { DBSchema } from 'idb'
import type { AuditEntry, Verdict } from '@okolos/contracts'

export const DB_NAME = 'okolos'
export const DB_VERSION = 1

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
  detail?: Readonly<Record<string, string | number | boolean>>
}

export interface ExceptionRecord {
  scope: 'domain' | 'rule' | 'extension'
  ref: string
  createdAt: string
  reason?: string
}

export interface SettingRecord {
  key: string
  value: string | number | boolean | null
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
  snapshots: { key: string; value: SnapshotRecord }
}
