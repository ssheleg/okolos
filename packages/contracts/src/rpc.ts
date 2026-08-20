import type { GateDecision } from './gate.js'
import type { PageCandidates } from './snapshot.js'
import type { Verdict } from './verdict.js'

/**
 * One sentence a frame hands upward, as a key and its arguments rather than words.
 *
 * Structurally `Explained` from `@okolos/i18n`, declared here because this package has
 * no dependencies and must not grow one for a shape three fields wide. The
 * compatibility is not left to eyesight: `credential-words.test.ts` assigns a real
 * `explained(...)` to this type, so a required field added there fails here.
 *
 * Why keys and not the finished sentence: the frame resolves nothing the reader has to
 * live with. Every other cross-boundary sentence in this project already travels this
 * way (B-75, B-77), and a frame is one more boundary — the words belong to whoever
 * draws them.
 */
export interface FrameLine {
  readonly explainKey: string
  readonly explainArgs: readonly string[]
  readonly explainArgKeys: readonly (string | null)[]
}

/**
 * What a frame can report, and why the shape is a union rather than one widened record.
 *
 * The relay was built for injections and carried their shape — `{origin, summary,
 * count}`. A password warning has facts and offers actions ("this is wrong", "leave",
 * "trust this site"), and pushing it through a summary string loses exactly the part a
 * person acts on. Widening the one record instead would give both kinds every other
 * kind's fields, all optional, and no reader could tell which are populated.
 *
 * `origin` is stamped by the background from the sender, never by the frame: the frame
 * is the thing being reported on, and the top frame must be able to tell an extension's
 * report from a claim by the page inside it. Anything the surface acts on — the host it
 * would trust — is derived from that stamped origin, not from a field the frame filled.
 */
export type FrameFinding =
  | {
      readonly kind: 'injection'
      readonly origin: string
      readonly summary: string
      readonly count: number
    }
  | {
      readonly kind: 'credential'
      readonly origin: string
      readonly severity: 'critical' | 'major' | 'minor'
      /** What is known and what is not, in the order the surface should read them. */
      readonly lines: readonly FrameLine[]
    }

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

/**
 * Every message that crosses a context boundary.
 *
 * Each entry needs a handler and a caller: a type with neither is a promise the
 * product does not keep, and four of them lived here for a week because the
 * options page reads storage directly instead of asking. A gate now checks it.
 */
export interface RpcMap {
  'page/candidates': { req: PageCandidates; res: { verdicts: Verdict[] } }
  /** Domains the user has marked legitimate, and the way to add one. */
  /** Opens the recovery checklist for what just happened. */
  /** Records a page trap in the journal, so the diff can show it. */
  /** What this device knows about a host, for the credential guard. */
  /** Announced to whatever page is listening; the journal is the real record. */
  /**
   * A finding in an embedded frame, pushed to the page that embeds it.
   *
   * The content script runs in every frame because injections hide in iframes too,
   * and only the top frame shows a warning — a banner inside a subframe can be
   * invisible, clipped, or drawn a dozen times across ad frames. The reporting half
   * of that arrangement did not exist: the subframe neutralised, armed the gate and
   * returned, so a poisoned iframe was handled and never mentioned. The origin is
   * here because "something on this page" and "something in the frame from
   * ads.example" are different warnings.
   */
  /**
   * A subframe reporting its own finding, and being told whether it landed.
   *
   * The relay used to happen inside the answer to `page/candidates`, which made it
   * fire exactly once — at the moment the frame asked. That loses the race the
   * common case actually runs: a frame reaches `document_idle` and finishes its
   * whole cycle before the embedding page's content script has started, so the
   * report arrives at a frame zero with no listener yet, and `sendMessage` rejects
   * into silence. Measured: 135 ms when the parent happens to be ready, never when
   * it is not.
   *
   * So the obligation sits with the frame, which is alive and can wait, and the
   * answer says whether there was anyone to tell. Retrying is not masking here —
   * the receiver is not failing, it does not exist yet.
   */
  'frame/report': {
    req: FrameFinding
    res: { delivered: boolean }
  }
  'frame/finding': {
    req: FrameFinding
    res: { ok: true }
  }
  /**
   * A download's verdict, as codes plus the words that were already resolved.
   *
   * `headline` and `shape` are **codes**: the words for them belong to the surface that
   * renders the banner, and until 2026-08-20 the background composed English sentences
   * and sent them across this line (B-75). `reasons` stays words, because those come
   * from the checks and whoever ran them resolved them through the catalogue.
   */
  'download/verdict': {
    req: {
      action: string
      headline: string
      shape: ReadonlyArray<{ code: string; filename?: string; mimeType?: string }>
      reasons: string
      skipped: string
    }
    res: { ok: true }
  }
  /** SHA-1 of a submitted password. The password itself never crosses this line. */
  'password/check': {
    /**
     * The digest, never the password, and the host it was submitted to — the
     * host is what makes "where else do I use this" answerable at all.
     */
    req: { sha1: string; host: string }
    res: {
      compromised: boolean
      count: number | null
      offline: boolean
      /**
       * A code and its numbers, not a sentence.
       *
       * Six English explanations used to cross this line from a zero-dependency
       * package, one of them with an English thousands separator baked in (B-75). The
       * words belong to the surface that shows the banner.
       */
      explain: { code: string; detail?: string; count?: number }
      /** Other hosts this device has seen the same password on, oldest first. */
      reusedOn: string[]
      /**
       * True when this device has no record of the password at all. Not the
       * same as "used nowhere else": a fresh install knows nothing, and the
       * screen must say which of the two it is.
       */
      reuseUnknown: boolean
    }
  }
  /** User-initiated: nothing is looked up in the background. */
  'leaks/check': {
    req: { address: string }
    res: {
      leaks: Array<{
        name: string
        occurredAt: string | null
        source: string
        classes: string[]
        domain?: string
      }>
      sources: Array<{ name: string; answered: boolean; why?: string }>
      complete: boolean
    }
  }
  /** The extension inventory, its deltas, and the two actions on them. */
  'extensions/state': {
    req: Record<string, never>
    res: {
      supported: boolean
      /**
       * Deliberately loose — strings, not unions — so a newer worker cannot break an
       * older page. `detail` used to carry a finished English sentence composed in
       * `core-extensions` (B-75); what crosses now is the kind and the values a
       * sentence needs, and the page words them from its own catalogue.
       */
      changes: Array<{
        kind: string
        id: string
        name: string
        severity: string
        publisher?: string | null
        previousPublisher?: string | null
        permissions?: string[]
        hosts?: string[]
      }>
      installed: Array<{
        id: string
        name: string
        version: string
        permissions: string[]
        enabled: boolean
        /**
         * What is true of it as it stands, computed in the worker (B-56).
         *
         * The page never sees `installType` or host permissions, so it cannot work these
         * out for itself — and they are the reason some of these rows are worth reading.
         * Loose on the wire, like `changes`: a newer worker must not break an older page.
         */
        standing?: Array<{
          kind: string
          id: string
          name: string
          severity: string
          installType?: string
          pair?: string[]
          everywhere?: boolean
        }>
      }>
    }
  }
  'extensions/disable': { req: { id: string }; res: { ok: boolean; why?: string } }
  'extensions/trust': { req: { id: string }; res: { ok: true } }
  /** The user dealt with a finding; it leaves the queue. */
  'finding/resolve': { req: { id: string }; res: { ok: true } }
  /** Not today. It ranks last until the given time rather than disappearing. */
  'finding/defer': { req: { id: string; until: string }; res: { ok: true } }
  'site/facts': { req: { host: string }; res: { trusted: boolean; firstSeen: string | null } }
  'trap/warned': { req: { kind: string; signals: string }; res: { ok: true } }
  /**
   * A state-changing request the page made while a finding on it was
   * unresolved. Observed, never held — see apps/extension/src/page-watch.
   */
  'page/request': { req: { method: string; host: string }; res: { ok: true } }
  'recovery/open': { req: { kind: string }; res: { ok: true } }
  /**
   * `domains` is kept for callers that only need the names — the lookalike
   * check asks on every navigation and has no use for the rest. `entries`
   * carries when and why, which the settings list needs and the hot path
   * would otherwise pay for.
   */
  'trust/list': {
    req: Record<string, never>
    res: {
      domains: string[]
      entries: Array<{ domain: string; grantedAt: string; reason?: string }>
    }
  }
  'trust/add': { req: { domain: string }; res: { ok: true } }
  /** Takes trust back. The checks resume on the next navigation. */
  'trust/revoke': { req: { domain: string }; res: { ok: true } }
  'gate/decision': { req: GateDecision; res: { ok: true } }
  /**
   * Something the content script did that the user should be able to read back.
   *
   * The page has no database of its own, and the self-audit journal is the
   * record the whole product's honesty rests on. Without this a restore that
   * could not finish existed only in the moment it happened — the page said
   * nothing, and nothing was written down either.
   */
  /**
   * Something the page has to say about itself, journalled rather than shown.
   *
   * `frame-unreported` is the give-up of a subframe that could not tell the page
   * embedding it, after nine seconds of trying. A silent return there would hide the
   * one case where the product found something and nobody was told — which is the
   * whole defect the retry exists to fix, arriving by a different road.
   *
   * `scan-failed` is the one that covers the **main** path: a page whose scan threw
   * or was refused produced no banner and no record, so it was indistinguishable from
   * a page with nothing hidden on it. Fail open is right; fail silent is not.
   *
   * `surface-removed` is the give-up of a page-level warning the page kept deleting
   * from the document. It is the one note that also **marks the extension's icon**,
   * because at that point every surface inside the page has been lost and the icon is
   * a channel the page does not own (ADR-0001).
   */
  'page/note': {
    req: {
      kind:
        | 'restore'
        | 'frame-unreported'
        | 'gate-unread'
        | 'password-unchecked'
        | 'surface-removed'
        | 'scan-failed'
        /** The budget ran out before anything was found: looked, could not finish. */
        | 'scan-blinded'
        /**
         * A frame's password warning never reached the page that embeds it.
         *
         * Its own kind rather than `frame-unreported`, because nothing else is
         * journalled about it: an injection that fails to relay was still neutralised
         * in the frame and has rows of its own, while a password warning that fails to
         * relay leaves no other trace of what was suppressed.
         */
        | 'credential-unreported'
      explain: string
    }
    res: { ok: true }
  }
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
