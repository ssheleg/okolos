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

export interface PasswordVerdict {
  readonly compromised: boolean
  /** How many times it appears, when the source says. */
  readonly count: number | null
  readonly source: PasswordSource
  /** True when the answer cost no network request at all. */
  readonly offline: boolean
  readonly explain: string
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
      explain:
        'This password is one of the most common in the world. It was recognised on this device, so nothing was sent anywhere.',
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
      explain: `This password could not be checked: ${cause instanceof Error ? cause.message : String(cause)}.`,
    }
  }

  const count = countIn(response.body, suffix)
  if (count === null) {
    return {
      compromised: false,
      count: null,
      source: 'range query',
      offline: false,
      explain:
        'This password does not appear in the breach corpus. Only the first five characters of its fingerprint were sent.',
    }
  }

  return {
    compromised: true,
    count,
    source: 'range query',
    offline: false,
    explain: `This password appears ${count.toLocaleString('en')} times in breached data. Only the first five characters of its fingerprint were sent.`,
  }
}

function countIn(body: string, suffix: string): number | null {
  for (const line of body.split('\n')) {
    const [candidate, count] = line.trim().split(':')
    if (candidate?.toUpperCase() !== suffix) continue
    const parsed = Number.parseInt(count ?? '', 10)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return null
}
