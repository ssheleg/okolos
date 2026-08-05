/**
 * The vocabulary every layer shares. Nothing here imports anything: contracts
 * are the one package that must stay loadable from a test, a service worker,
 * a content script and a Cloudflare Worker alike.
 */

export type Confidence = 'certain' | 'high' | 'medium' | 'low'
export type Severity = 'critical' | 'major' | 'minor' | 'info'

/** Which detection stage produced a piece of evidence. */
export type Stage = 'diff' | 'rules' | 'model' | 'feed' | 'inventory' | 'corpus'

/**
 * `gate` is decided by the action interceptor rather than by the ladder: it
 * needs to know an agent is about to act, which a verdict alone cannot say.
 */
export type Action = 'silent' | 'inform' | 'warn' | 'block' | 'sanitize' | 'gate'

export type EvidenceKind =
  | 'hidden-text'
  | 'clipboard-write'
  | 'domain-lookalike'
  | 'feed-match'
  | 'permission-delta'
  | 'publisher-change'
  | 'hash-match'
  | 'form-context'
  | 'fullscreen-trap'
  | 'type-mismatch'
  | 'corpus-hit'

export interface Evidence {
  readonly kind: EvidenceKind
  readonly stage: Stage
  /** Where to point the user: a CSS path, a download id, an extension id. */
  readonly locator?: string
  /** At most 200 characters, already redacted. Never a whole document. */
  readonly snippet?: string
  readonly detail: Readonly<Record<string, string | number | boolean>>
}

export type SubjectKind = 'page' | 'url' | 'download' | 'extension' | 'credential' | 'domain'

export type VerdictCategory =
  | 'injection'
  | 'phishing'
  | 'lookalike'
  | 'clickfix'
  | 'techsupport'
  | 'download'
  | 'credential'
  | 'password'
  | 'extension'
  | 'leak'

/** Where a verdict's authority comes from — shown to the user verbatim. */
export interface SourceRef {
  readonly name: string
  readonly version: string
  readonly updatedAt: string
}

export interface Verdict {
  readonly id: string
  readonly subject: { readonly kind: SubjectKind; readonly ref: string }
  readonly category: VerdictCategory
  readonly severity: Severity
  readonly confidence: Confidence
  readonly evidence: readonly Evidence[]
  readonly action: Action
  readonly sources: readonly SourceRef[]
  /**
   * ISO-8601, supplied by the caller. Detectors never read the clock — that is
   * what makes a corpus run reproducible instead of flaky.
   */
  readonly createdAt: string
}
