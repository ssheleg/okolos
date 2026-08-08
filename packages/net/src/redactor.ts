/**
 * The last check before anything leaves the device.
 *
 * It exists to fail loudly during development. A privacy guarantee that is
 * only a convention survives exactly until someone adds a debug parameter in
 * a hurry; one that throws in the developer's face survives longer.
 */

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/
const ABSOLUTE_URL = /https?:\/\//i
const MARKUP = /<[a-z!/][^>]*>/i

export type RedactionReason = 'email' | 'absolute-url' | 'markup'

/**
 * What a request has declared it must carry.
 *
 * There is exactly one such thing today. Two leak sources answer only to a
 * full address — Hudson Rock's Cavalier and HIBP's breached-account endpoint
 * take no hash, k-anonymous or otherwise — so a leak lookup cannot be made
 * without sending one.
 *
 * Making that an explicit declaration rather than an accident is the whole
 * point. Before this, the address reached both hosts because it was
 * percent-encoded and the guard read the raw string: the exception existed, it
 * simply was not written anywhere, and nothing in the product or the interface
 * knew about it.
 */
export type Carries = 'address'

export interface RedactionFinding {
  readonly reason: RedactionReason
  readonly where: 'url' | 'body'
}

/**
 * Percent-decoding rounds, so an encoded value is read as what it is.
 *
 * Two, because a value that passes through two layers that each encode arrives
 * double-escaped and that happens by accident; beyond that it is deliberate,
 * and this guard is aimed at accidents. Bounded so a crafted input cannot make
 * it loop.
 */
const DECODE_ROUNDS = 2

/**
 * Every readable form of a string: the raw one, and what it says once the
 * escaping is undone.
 *
 * Reading only the raw form is what let `?u=https%3A%2F%2Fvictim.test%2Fpage`
 * through — and a URL in a query string is percent-encoded by every API that
 * has ever accepted one, so the raw form was the one nobody would write.
 */
function readableForms(value: string): string[] {
  const forms = [value]
  let current = value
  for (let round = 0; round < DECODE_ROUNDS; round += 1) {
    let decoded: string
    try {
      // `+` is a space in form encoding, and a value that was form-encoded
      // reads wrong without it.
      decoded = decodeURIComponent(current.replace(/\+/g, ' '))
    } catch {
      // Malformed escaping — a lone `%`. Not decodable, and throwing here
      // would take down a request this only exists to inspect.
      break
    }
    if (decoded === current) break
    forms.push(decoded)
    current = decoded
  }
  return forms
}

const matches = (pattern: RegExp, value: string): boolean =>
  readableForms(value).some((form) => pattern.test(form))

/**
 * Returns the first problem found, or null when the request is clean.
 *
 * `carries` names what this request has declared it must send. An address is
 * permitted only when declared; anything undeclared is refused exactly as
 * before.
 */
export function findForbiddenContent(
  url: string,
  body?: string,
  carries?: Carries,
): RedactionFinding | null {
  const inspectable = userFilledParts(url)
  const addressAllowed = carries === 'address'

  if (inspectable) {
    if (!addressAllowed && matches(EMAIL, inspectable)) return { reason: 'email', where: 'url' }
    if (matches(ABSOLUTE_URL, inspectable)) return { reason: 'absolute-url', where: 'url' }
  }

  if (body) {
    if (!addressAllowed && matches(EMAIL, body)) return { reason: 'email', where: 'body' }
    if (matches(ABSOLUTE_URL, body)) return { reason: 'absolute-url', where: 'body' }
    if (matches(MARKUP, body)) return { reason: 'markup', where: 'body' }
  }

  return null
}

/**
 * The parts of a URL a caller can fill with user data: the path, the query and
 * the fragment. The origin is ours.
 *
 * The path used to be excluded on the grounds that it belongs to our own
 * endpoints — which is true right up until a caller interpolates into it, and
 * one does: HIBP's breached-account endpoint takes the address as a path
 * segment. Excluding the path meant the single most sensitive value this
 * product ever sends was never looked at.
 */
export function userFilledParts(url: string): string | null {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    // Not a URL we can parse. Inspect the whole string rather than none of it:
    // a guard that gives up on malformed input is a guard with an escape hatch.
    return url
  }
}
