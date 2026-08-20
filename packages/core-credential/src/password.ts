/**
 * Checking a password without telling anyone what it is.
 *
 * Two stages, in an order that is itself the privacy guarantee. A short list of
 * the passwords that appear at the top of every breach corpus is compiled into
 * the extension; a match there is answered on the device and no request is made
 * at all. Only a password that is *not* obviously common reaches the second
 * stage, and even then what leaves is five hexadecimal characters of a SHA-1
 * digest — a bucket shared with hundreds of thousands of other passwords.
 *
 * The order matters more than it looks. Checking the network first and the list
 * second would produce the same verdicts and leak a request for every one of
 * the most common passwords in the world, which are exactly the ones whose
 * users are least able to afford the exposure.
 */

export const PREFIX_LENGTH = 5

export interface RangeResponse {
  /** Lines of `SUFFIX:COUNT`, as the range API returns them. */
  readonly body: string
}

export interface PasswordCheckDeps {
  /** SHA-1 of the password, uppercase hex. Computed by the caller. */
  readonly sha1: string
  /** Suffixes of the built-in list that share this prefix, uppercase. */
  localSuffixes(prefix: string): readonly string[]
  /** Fetches the range. Never called when the local list already answered. */
  fetchRange(prefix: string): Promise<RangeResponse>
}

export type PasswordSource = 'built-in list' | 'range query' | 'nothing'

/**
 * Why the answer is what it is, as a code rather than a sentence.
 *
 * Six English sentences lived here, in a package with zero dependencies, and one of them
 * formatted a number with `toLocaleString('en')` — an English thousands separator on a
 * ru-default interface, which the i18n sweep cannot even see because it is not a quoted
 * string (B-75). The words belong to the surface; what belongs here is which case this
 * is and the numbers that case needs.
 */
export type PasswordExplanation =
  | { readonly code: 'in-common-list' }
  | { readonly code: 'unreachable'; readonly detail: string }
  | { readonly code: 'unreadable' }
  | { readonly code: 'absent' }
  | { readonly code: 'found'; readonly count: number }

export interface PasswordVerdict {
  readonly compromised: boolean
  /** How many times it appears, when the source says. */
  readonly count: number | null
  readonly source: PasswordSource
  /** True when the answer cost no network request at all. */
  readonly offline: boolean
  readonly explain: PasswordExplanation
}

export async function checkPassword(deps: PasswordCheckDeps): Promise<PasswordVerdict> {
  const sha1 = deps.sha1.toUpperCase()
  const prefix = sha1.slice(0, PREFIX_LENGTH)
  const suffix = sha1.slice(PREFIX_LENGTH)

  if (deps.localSuffixes(prefix).includes(suffix)) {
    return {
      compromised: true,
      count: null,
      source: 'built-in list',
      offline: true,
      explain: { code: 'in-common-list' },
    }
  }

  let response: RangeResponse
  try {
    response = await deps.fetchRange(prefix)
  } catch (cause) {
    // An unanswerable question is not a clean bill of health.
    return {
      compromised: false,
      count: null,
      source: 'nothing',
      offline: false,
      explain: {
        code: 'unreachable',
        detail: cause instanceof Error ? cause.message : String(cause),
      },
    }
  }

  const answer = countIn(response.body, suffix)

  if (answer.kind === 'unreadable') {
    // The same shape as a failed request, because it is the same situation:
    // the question was asked and not answered.
    return {
      compromised: false,
      count: null,
      source: 'nothing',
      offline: false,
      explain: { code: 'unreadable' },
    }
  }

  if (answer.kind === 'absent') {
    return {
      compromised: false,
      count: null,
      source: 'range query',
      offline: false,
      explain: { code: 'absent' },
    }
  }

  return {
    compromised: true,
    count: answer.count,
    source: 'range query',
    offline: false,
    /**
     * The count travels as a number, not as a formatted string. It used to be
     * `toLocaleString('en')` — an English thousands separator, chosen inside a package
     * that has no business knowing the reader's locale.
     */
    explain: { code: 'found', count: answer.count },
  }
}

/**
 * What the range response says about our suffix.
 *
 * Three answers, and conflating them was the bug. `absent` is the clean bill.
 * `unreadable` is a line we found and could not parse — it says nothing, and
 * the count used to fall back to zero, which the caller then read as a hit.
 * And zero itself is not a hit: the request carries `Add-Padding: true`, which
 * asks the API to invent entries so the response is a constant size, and those
 * carry a count of zero by definition. Reporting one produced "this password
 * appears 0 times in breached data" — a compromise verdict refuted by its own
 * number.
 */
type RangeAnswer =
  | { readonly kind: 'found'; readonly count: number }
  | { readonly kind: 'absent' }
  | { readonly kind: 'unreadable' }

function countIn(body: string, suffix: string): RangeAnswer {
  for (const line of body.split('\n')) {
    const [candidate, count] = line.trim().split(':')
    if (candidate?.toUpperCase() !== suffix) continue
    const parsed = Number.parseInt((count ?? '').trim(), 10)
    if (!Number.isFinite(parsed) || parsed < 0) return { kind: 'unreadable' }
    // Zero is padding, and padding is not a breach.
    return parsed === 0 ? { kind: 'absent' } : { kind: 'found', count: parsed }
  }
  return { kind: 'absent' }
}
