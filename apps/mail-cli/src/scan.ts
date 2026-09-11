import { checkLookalike, DEFAULT_WATCHLIST } from '@okolos/core-lookalike'
import {
  CHECKS,
  assembleVerdict,
  buildReport,
  checkReplyPath,
  checkSenderAuth,
  checkSenderIdentity,
  parseMessage,
  type CheckId,
  type CheckOutcome,
  type MailMessage,
} from '@okolos/core-mail'
import type { Resolver } from '@okolos/i18n'

import { render, type RenderOptions } from './render.js'

/**
 * What the command answers with, as a number a script can read.
 *
 * `unreadable` is deliberately not folded into `nothingFound`. A scan that
 * failed is not a clean message — the browser side shipped that mistake and
 * paid for it (B-74): an error answer was handed to the caller as if it were a
 * response, and a failed page scan read as a clean page. A command line makes
 * the same mistake cheaper to repeat, because the exit status is what most
 * callers read and the words are what most humans read.
 */
export const EXIT = {
  nothingFound: 0,
  signalsFound: 1,
  unreadable: 2,
} as const

/**
 * Why a check did not run, as a catalogue key.
 *
 * A `Record` rather than a bare literal so `tools/locales.test.ts` can see the
 * key: the gate reads quoted arguments to the resolver and `NAME_KEY: Record`
 * maps, and a key it cannot see is reported dead and then deleted out from
 * under its caller.
 */
const SKIP_KEY: Readonly<Record<'notBuilt', string>> = {
  notBuilt: 'mailSkipNotBuilt',
}

const FAILURE_KEY: Readonly<Record<string, string>> = {
  empty: 'mailParseEmpty',
  'no-headers': 'mailParseNoHeaders',
  'emlx-length-mismatch': 'mailParseEmlxLengthMismatch',
  'too-large': 'mailParseTooLarge',
}

export interface ScanResult {
  readonly text: string
  readonly code: number
}

/**
 * What has been built, over a registry that still declares what has not.
 *
 * The unbuilt checks report `not built` rather than being absent from the
 * output — the walking skeleton shipped that way deliberately, so the surface
 * carrying gaps was exercised before the first detector existed. Each detector
 * that lands replaces one of those lines, and the shape of the answer does not
 * change when the last one does.
 */
function outcomes(message: MailMessage): Map<CheckId, CheckOutcome> {
  const identity = {
    lookalike: (host: string) => checkLookalike(host, DEFAULT_WATCHLIST),
    watchlist: DEFAULT_WATCHLIST,
  }
  const built: Partial<Record<CheckId, CheckOutcome>> = {
    senderAuth: checkSenderAuth(message),
    senderIdentity: checkSenderIdentity(message, identity),
    replyPath: checkReplyPath(message),
  }
  return new Map(
    CHECKS.map((check) => [check, built[check] ?? { ran: false, why: SKIP_KEY.notBuilt }]),
  )
}

export function scan(source: string, t: Resolver, options: RenderOptions): ScanResult {
  const parsed = parseMessage(source)
  if (!parsed.ok) {
    const reason = t(FAILURE_KEY[parsed.reason.code] ?? parsed.reason.code, [])
    return { text: t('mailUnreadable', [reason]), code: EXIT.unreadable }
  }

  const verdict = assembleVerdict(outcomes(parsed.message), {
    truncated: parsed.message.truncated,
  })
  return {
    text: render(buildReport(parsed.message, verdict), t, options),
    code: verdict.signals.length > 0 ? EXIT.signalsFound : EXIT.nothingFound,
  }
}
