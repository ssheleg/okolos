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

export interface CredentialWarning {
  readonly severity: 'critical' | 'major' | 'minor'
  /** What is known, in sentences the user can act on. */
  readonly facts: readonly string[]
  /** What is not known, named rather than assumed. */
  readonly missing: readonly string[]
}

export function guardCredentialEntry(ctx: CredentialContext): CredentialWarning | null {
  if (ctx.trusted) return null

  const facts: string[] = []
  const missing: string[] = []
  let severity: CredentialWarning['severity'] = 'minor'

  if (!ctx.secure) {
    // Not a heuristic: anything typed here travels in the clear.
    facts.push('This connection is not encrypted, so anything typed here can be read in transit.')
    severity = 'critical'
  }

  if (ctx.resembles) {
    facts.push(`This address imitates ${ctx.resembles}.`)
    severity = 'critical'
  }

  if (ctx.postsTo) {
    facts.push(`This form sends what you type to ${ctx.postsTo}, not to ${ctx.host}.`)
    if (severity !== 'critical') severity = 'major'
  }

  const age = daysSince(ctx.firstSeen, ctx.now)
  if (age === null) {
    missing.push('how long you have been visiting this site — no earlier visit is recorded on this device')
  } else if (age < ESTABLISHED_AFTER_DAYS) {
    facts.push(
      age === 0
        ? 'This is the first day this device has seen this site.'
        : `This device first saw this site ${age} day${age === 1 ? '' : 's'} ago.`,
    )
    if (severity === 'minor') severity = 'major'
  }

  // Nothing is looked up anywhere, so the fact a paid product would show is a
  // fact this one has to admit it does not have.
  missing.push('when the domain was registered — that would require asking a server about this address')

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
