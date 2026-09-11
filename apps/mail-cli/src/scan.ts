import {
  CHECKS,
  assembleVerdict,
  buildReport,
  parseMessage,
  type CheckId,
  type CheckOutcome,
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
 * Phase 0 runs no detector, and says so four times.
 *
 * Every check in the registry reports `not built` rather than being absent from
 * the output, so the surface that carries gaps is exercised end to end before
 * the first detector exists. That is the walking skeleton this module map asks
 * for: the honest-degradation path is the path that ships first, instead of
 * being added once the happy one already reads as complete.
 */
function outcomes(): Map<CheckId, CheckOutcome> {
  return new Map(CHECKS.map((check) => [check, { ran: false, why: SKIP_KEY.notBuilt }]))
}

export function scan(source: string, t: Resolver, options: RenderOptions): ScanResult {
  const parsed = parseMessage(source)
  if (!parsed.ok) {
    const reason = t(FAILURE_KEY[parsed.reason.code] ?? parsed.reason.code)
    return { text: t('mailUnreadable', [reason]), code: EXIT.unreadable }
  }

  const verdict = assembleVerdict(outcomes(), { truncated: parsed.message.truncated })
  return {
    text: render(buildReport(parsed.message, verdict), t, options),
    code: verdict.signals.length > 0 ? EXIT.signalsFound : EXIT.nothingFound,
  }
}
