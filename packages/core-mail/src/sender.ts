import { registrableDomain } from '@okolos/core-lookalike'
import type { LookalikeVerdict } from '@okolos/core-lookalike'

import type { MailMessage } from './types.js'
import type { CheckOutcome, MailFact, MailSignal, Severity } from './verdict.js'

/**
 * Judging the sender by what the sender cannot forge.
 *
 * Three checks rather than one, because they fail independently and a reader
 * has to be able to tell which of them happened. The display name is the field
 * an attacker controls completely and the field most clients show; the address
 * is controlled too; what is *not* controlled is what the receiving server
 * already computed on the way in, and whether the registrable domain of the
 * address resembles one somebody is likely to trust.
 *
 * **This file reads wording in one place only, and that place is a coverage
 * claim** (standing instruction 10). The brand check matches the *label* of a
 * watched domain — `paypal` from `paypal.com` — so it covers brands whose Latin
 * label appears literally in the display name. A Russian brand written as
 * «Сбербанк» is not in the watchlist and is not found; naming that here is the
 * difference between a limit and a lie. Everything else in this file is
 * structural: a header value, a domain comparison, a script mixture.
 */

export interface IdentityDeps {
  /** Injected so this package stays free of the watchlist's own policy. */
  readonly lookalike: (host: string) => LookalikeVerdict | null
  readonly watchlist: readonly string[]
}

const SIGNAL_KEY = {
  dmarcFail: 'mailSenderDmarcFail',
  spfFail: 'mailSenderSpfFail',
  dkimFail: 'mailSenderDkimFail',
  notAligned: 'mailSenderNotAligned',
  lookalikeDomain: 'mailSenderLookalikeDomain',
  brandMismatch: 'mailSenderBrandMismatch',
  replyElsewhere: 'mailSenderReplyElsewhere',
} as const

const FACT_KEY = {
  fromDomain: 'mailFactFromDomain',
  signedFor: 'mailFactSignedFor',
  displayName: 'mailFactDisplayName',
  address: 'mailFactAddress',
  resembles: 'mailFactResembles',
  replyDomain: 'mailFactReplyDomain',
} as const

const SKIP_KEY = {
  noAuthResult: 'mailSkipNoAuthResult',
  noSender: 'mailSkipNoSender',
} as const

function signal(
  check: 'senderAuth' | 'senderIdentity' | 'replyPath',
  severity: Severity,
  code: string,
  facts: readonly MailFact[] = [],
): MailSignal {
  return { check, severity, code, facts }
}

function header(message: MailMessage, name: string): string | null {
  return message.headers.get(name)?.[0] ?? null
}

/**
 * The verdict a mechanism got, read out of RFC 7601's `method=result` form.
 *
 * Deliberately not a full grammar. The header is written by the receiving
 * server for its own use and the shapes in the wild vary; what is stable is
 * `method=result` somewhere in it, and reading more than that would be
 * confidence this parser has not earned.
 */
function mechanism(line: string, method: string): string | null {
  const found = new RegExp(`\\b${method}\\s*=\\s*([a-z]+)`, 'i').exec(line)
  return found?.[1]?.toLowerCase() ?? null
}

function signedDomain(line: string): string | null {
  const found = /header\.d\s*=\s*([^\s;]+)/i.exec(line)
  return found?.[1]?.toLowerCase() ?? null
}

const FAILING = new Set(['fail', 'softfail', 'permerror', 'temperror', 'none'])

export function checkSenderAuth(message: MailMessage): CheckOutcome {
  const results = header(message, 'authentication-results')
  const receivedSpf = header(message, 'received-spf')
  const dkimHeader = header(message, 'dkim-signature')

  if (results === null && receivedSpf === null && dkimHeader === null) {
    return { ran: false, why: SKIP_KEY.noAuthResult }
  }

  const signals: MailSignal[] = []
  const line = results ?? ''

  const dmarc = mechanism(line, 'dmarc')
  if (dmarc !== null && FAILING.has(dmarc)) {
    // The strongest of the three: DMARC failing means the domain's own policy
    // says this message is not theirs.
    signals.push(signal('senderAuth', 'critical', SIGNAL_KEY.dmarcFail))
  }

  const spf = mechanism(line, 'spf') ?? mechanism(receivedSpf ?? '', 'received-spf') ?? spfWord(receivedSpf)
  if (spf !== null && FAILING.has(spf)) {
    signals.push(signal('senderAuth', 'major', SIGNAL_KEY.spfFail))
  }

  const dkim = mechanism(line, 'dkim')
  if (dkim !== null && FAILING.has(dkim)) {
    signals.push(signal('senderAuth', 'major', SIGNAL_KEY.dkimFail))
  }

  /**
   * A signature that validates for a domain nobody claimed to write from.
   *
   * The mechanics pass and the identity is somebody else's — which is why this
   * is checked even when `dkim=pass`, and why it is compared on the registrable
   * domain rather than on the exact host: `mail.bank.test` signing for
   * `bank.test` is the ordinary arrangement, not an anomaly.
   */
  const from = message.from[0]?.domain ?? null
  const signedFor = signedDomain(line) ?? signedDomain(dkimHeader ?? '')
  if (dkim === 'pass' && from !== null && signedFor !== null) {
    const a = registrableDomain(from)
    const b = registrableDomain(signedFor)
    if (a !== null && b !== null && a !== b) {
      signals.push(
        signal('senderAuth', 'major', SIGNAL_KEY.notAligned, [
          { label: FACT_KEY.fromDomain, value: from },
          { label: FACT_KEY.signedFor, value: signedFor },
        ]),
      )
    }
  }

  return { ran: true, signals }
}

/** `Received-SPF: fail (…)` puts the result first, with no `method=` at all. */
function spfWord(received: string | null): string | null {
  if (received === null) return null
  const first = /^\s*([a-z]+)/i.exec(received)
  return first?.[1]?.toLowerCase() ?? null
}

export function checkSenderIdentity(message: MailMessage, deps: IdentityDeps): CheckOutcome {
  const sender = message.from[0]
  if (sender?.domain == null) return { ran: false, why: SKIP_KEY.noSender }

  const signals: MailSignal[] = []

  const resembles = deps.lookalike(sender.domain)
  if (resembles !== null) {
    signals.push(
      signal('senderIdentity', 'critical', SIGNAL_KEY.lookalikeDomain, [
        { label: FACT_KEY.address, value: sender.domain },
        { label: FACT_KEY.resembles, value: resembles.resembles },
      ]),
    )
  }

  const claimed = brandIn(sender.display, deps.watchlist)
  if (claimed !== null && !belongsTo(sender.domain, claimed)) {
    signals.push(
      signal('senderIdentity', 'critical', SIGNAL_KEY.brandMismatch, [
        { label: FACT_KEY.displayName, value: sender.display ?? '' },
        { label: FACT_KEY.address, value: sender.domain },
      ]),
    )
  }

  return { ran: true, signals }
}

/**
 * The watched domain a display name claims to be, or null.
 *
 * Bounded by a word boundary rather than by `includes`: "Applesauce Recipes"
 * carries `apple` as a substring and is not Apple, and a check that fires on it
 * teaches a person to dismiss the next one without reading. The boundary is
 * defined against letters and digits of any script, so a Cyrillic word next to
 * a Latin brand still separates.
 */
function brandIn(display: string | null, watchlist: readonly string[]): string | null {
  if (display === null) return null
  const haystack = display.toLowerCase()
  for (const domain of watchlist) {
    const label = domain.slice(0, domain.indexOf('.'))
    if (label.length < 4) continue
    const at = haystack.indexOf(label)
    if (at < 0) continue
    const before = haystack[at - 1]
    const after = haystack[at + label.length]
    if (isWordish(before) || isWordish(after)) continue
    return domain
  }
  return null
}

function isWordish(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch)
}

function belongsTo(host: string, domain: string): boolean {
  const registrable = registrableDomain(host)
  return registrable !== null && registrable === registrableDomain(domain)
}

export function checkReplyPath(message: MailMessage): CheckOutcome {
  const from = message.from[0]?.domain ?? null
  if (from === null) return { ran: false, why: SKIP_KEY.noSender }

  const replyTo = message.replyTo[0]?.domain ?? null
  if (replyTo === null) return { ran: true, signals: [] }

  const a = registrableDomain(from)
  const b = registrableDomain(replyTo)
  if (a === null || b === null || a === b) return { ran: true, signals: [] }

  return {
    ran: true,
    signals: [
      signal('replyPath', 'major', SIGNAL_KEY.replyElsewhere, [
        { label: FACT_KEY.fromDomain, value: from },
        { label: FACT_KEY.replyDomain, value: replyTo },
      ]),
    ],
  }
}
