import type { Severity } from '@okolos/contracts'

/**
 * The words for a severity, in one place.
 *
 * There were two identical tables under two different names — `SEVERITY_KEY` in the banner
 * and `SEVERITY_WORD_KEY` on the dashboard — and the queue was about to become a third.
 * The overview's own comment records why it exists at all: a first draft of that band
 * invented `high`/`medium`/`low` and three keys to go with them, "a second vocabulary for
 * severity, introduced by the very pass whose job was to stop one action having two names".
 * Two copies of the right table are the same failure one step later: they agree until one
 * of them is edited.
 *
 * `Severity` is `critical | major | minor | info` everywhere in this codebase, and the
 * `Record` keeps it that way — a fifth level fails the build here rather than rendering as
 * nothing on three screens.
 */
export const SEVERITY_WORD_KEY: Readonly<Record<Severity, string>> = {
  critical: 'bannerSeverityCritical',
  major: 'bannerSeverityMajor',
  minor: 'bannerSeverityMinor',
  info: 'bannerSeverityInfo',
}
