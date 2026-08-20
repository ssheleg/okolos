/**
 * Should typing a password here give someone pause?
 *
 * The honest answer is built only from what the device already knows: whether
 * the user has been here before, whether the connection is encrypted, where the
 * form sends what they type, and whether the name imitates one they trust.
 * Domain age — the fact a commercial product would look up — would mean sending
 * the address of every login page the user visits to a server, which is the
 * thing this product exists not to do. So it is listed among what is *not*
 * known rather than quietly treated as "new".
 *
 * The warning never blocks typing. A person mid-login on a site they know is
 * better served by an explanation they can ignore than by a modal.
 */

export const ESTABLISHED_AFTER_DAYS = 30

export interface CredentialContext {
  readonly host: string
  /** The user has said this site is fine. */
  readonly trusted: boolean
  /** When this device first saw the domain, or null if that is unknown. */
  readonly firstSeen: string | null
  readonly secure: boolean
  /** The origin the form posts to, when it is not this one. */
  readonly postsTo: string | null
  /** A watched name this domain imitates, from the lookalike check. */
  readonly resembles: string | null
  readonly now: string
}

/**
 * What is known and what is not, as codes rather than sentences.
 *
 * They were English sentences in a package with zero dependencies (B-75) — including
 * `day${age === 1 ? '' : 's'}`, English pluralisation that no Russian sentence can
 * borrow. The words belong to `apps/extension/src/content/credential.ts`, which has the
 * catalogue; what belongs here is which facts are true and how serious they make this.
 */
export type CredentialFact =
  | { readonly code: 'not-encrypted' }
  | { readonly code: 'imitates'; readonly resembles: string }
  | { readonly code: 'posts-elsewhere'; readonly postsTo: string; readonly host: string }
  | { readonly code: 'first-day' }
  | { readonly code: 'seen-for-days'; readonly days: number }

/** Something this product cannot know, named rather than assumed. */
export type CredentialUnknown = { readonly code: 'how-long-visited' } | { readonly code: 'when-registered' }

export interface CredentialWarning {
  readonly severity: 'critical' | 'major' | 'minor'
  /** What is known — codes, so the surface can say it in the reader's language. */
  readonly facts: readonly CredentialFact[]
  /** What is not known, named rather than assumed. */
  readonly missing: readonly CredentialUnknown[]
}

export function guardCredentialEntry(ctx: CredentialContext): CredentialWarning | null {
  if (ctx.trusted) return null

  const facts: CredentialFact[] = []
  const missing: CredentialUnknown[] = []
  let severity: CredentialWarning['severity'] = 'minor'

  if (!ctx.secure) {
    // Not a heuristic: anything typed here travels in the clear.
    facts.push({ code: 'not-encrypted' })
    severity = 'critical'
  }

  if (ctx.resembles) {
    facts.push({ code: 'imitates', resembles: ctx.resembles })
    severity = 'critical'
  }

  if (ctx.postsTo) {
    facts.push({ code: 'posts-elsewhere', postsTo: ctx.postsTo, host: ctx.host })
    if (severity !== 'critical') severity = 'major'
  }

  const age = daysSince(ctx.firstSeen, ctx.now)
  if (age === null) {
    missing.push({ code: 'how-long-visited' })
  } else if (age < ESTABLISHED_AFTER_DAYS) {
    facts.push(age === 0 ? { code: 'first-day' } : { code: 'seen-for-days', days: age })
    if (severity === 'minor') severity = 'major'
  }

  // Nothing is looked up anywhere, so the fact a paid product would show is a
  // fact this one has to admit it does not have.
  missing.push({ code: 'when-registered' })

  const established = age !== null && age >= ESTABLISHED_AFTER_DAYS
  if (facts.length === 0 && established) return null

  return { severity, facts, missing }
}

function daysSince(iso: string | null, now: string): number | null {
  if (!iso) return null
  const then = Date.parse(iso)
  const at = Date.parse(now)
  if (!Number.isFinite(then) || !Number.isFinite(at)) return null
  return Math.max(0, Math.floor((at - then) / 86_400_000))
}
