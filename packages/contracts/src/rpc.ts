import type { PageCandidates } from './snapshot.js'
import type { Verdict } from './verdict.js'

/** Everything that may leave the device, named so the audit log can say why. */
export type Purpose =
  | 'feed-update'
  | 'model-update'
  | 'password-range'
  | 'leak-lookup'
  | 'file-hash'
  | 'domain-status'

export interface AuditEntry {
  readonly id: string
  readonly createdAt: string
  /** Host only — a path with parameters in the log would defeat the point. */
  readonly destination: string
  readonly purpose: Purpose
  /** How to describe what was sent to a human: e.g. 'hash-prefix:5BAA6'. */
  readonly payloadShape: string
  readonly triggeredBy: string
  readonly outcome: 'sent' | 'blocked-by-redactor' | 'failed'
}

export interface RpcMap {
  'page/candidates': { req: PageCandidates; res: { verdicts: Verdict[] } }
  'page/rescan': { req: { frameId: number }; res: { ok: true } }
  'audit/list': { req: { since?: string; limit?: number }; res: { entries: AuditEntry[] } }
  'data/export': { req: Record<string, never>; res: { json: string } }
  'data/wipe': { req: { confirm: true }; res: { ok: true } }
}

export type RpcType = keyof RpcMap

export interface Envelope<T extends RpcType = RpcType> {
  readonly v: 1
  readonly type: T
  readonly payload: RpcMap[T]['req']
}

export interface RpcError {
  readonly v: 1
  readonly error: 'unsupported' | 'failed'
  readonly detail?: string
}

/**
 * An unknown type or a future version is answered, logged and survived —
 * a receiver that throws on an unexpected message turns a version skew into
 * a broken page.
 */
export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { v?: unknown; type?: unknown }
  return candidate.v === 1 && typeof candidate.type === 'string'
}
