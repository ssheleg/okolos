import { t } from '@okolos/i18n'

/**
 * The injection warning's sentence, assembled where it can be tested.
 *
 * Three facts go into one line: how many other findings there are, whether anything was
 * neutralised, and **whether the page was read in full**. The third had no test at all —
 * `warnScanTruncated` appeared once in this repository, at its own call site, and nothing
 * asserted it. It cannot be asserted from outside either: in the shipping build the panel
 * lives in a closed shadow root, which is what stops a hostile page reading the warning and
 * equally stops a spec (measured 2026-08-21 — `toContainText` came back empty).
 *
 * So the assembly moves here, beside `credential-words.ts` and `password-words.ts`, which
 * exist for the same reason: a sentence composed inside a renderer is a sentence no test
 * reads.
 */
export function injectionDetail(total: number, partialScan: boolean, neutralised: number): string {
  // Both fragments were English literals the i18n sweep could not see: one begins with a
  // space, the other with a space and then a word, and its anchor wanted a letter
  // immediately after the quote.
  const others = total > 1 ? t('warnInjectionOthers', String(total - 1)) : ''
  const scanNote = partialScan ? t('warnScanTruncated') : ''
  return neutralised > 0
    ? t('warnInjectionNeutralised', others, scanNote)
    : t('warnInjectionPlain', others, scanNote)
}
