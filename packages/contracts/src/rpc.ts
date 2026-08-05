import type { GateDecision } from './gate.js'
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
  /** Domains the user has marked legitimate, and the way to add one. */
  /** Opens the recovery checklist for what just happened. */
  /** Records a page trap in the journal, so the diff can show it. */
  /** What this device knows about a host, for the credential guard. */
  /** Announced to whatever page is listening; the journal is the real record. */
  'download/verdict': {
    req: { action: string; headline: string; reasons: string; skipped: string }
    res: { ok: true }
  }
  /** SHA-1 of a submitted password. The password itself never crosses this line. */
  'password/check': {
    req: { sha1: string }
    res: { compromised: boolean; count: number | null; offline: boolean; explain: string }
  }
  /** User-initiated: nothing is looked up in the background. */
  'leaks/check': {
    req: { address: string }
    res: {
      leaks: Array<{ name: string; occurredAt: string | null; source: string; classes: string[] }>
      sources: Array<{ name: string; answered: boolean; why?: string }>
      complete: boolean
      coverage: string
    }
  }
  'site/facts': { req: { host: string }; res: { trusted: boolean; firstSeen: string | null } }
  'trap/warned': { req: { kind: string; signals: string }; res: { ok: true } }
  'recovery/open': { req: { kind: string }; res: { ok: true } }
  'trust/list': { req: Record<string, never>; res: { domains: string[] } }
  'trust/add': { req: { domain: string }; res: { ok: true } }
  'gate/decision': { req: GateDecision; res: { ok: true } }
  /** Rebuilds blocking rules from the feed in force. */
  'rules/refresh': { req: Record<string, never>; res: { installed: number; dropped: number } }
  'block/context': {
    req: Record<string, never>
    res: { url: string; feed: string | null; entryDate: string | null; feedAgeDays: number | null } | null
  }
  /** Remembers the user's exception and returns where to go, or null if refused. */
  'block/allow': { req: { url: string }; res: { url: string } | null }
  /** `score: null` means there is no model here — never that the text is fine. */
  'inference/score': { req: { text: string }; res: { score: number | null; backend: string | null } }
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
