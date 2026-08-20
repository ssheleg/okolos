import type { InventoryChange, PackageFinding, PackageReport } from '@okolos/core-extensions'
import { explained, t, type ExplainArg, type Explained } from '@okolos/i18n'

/**
 * Wording the facts `core-extensions` reports.
 *
 * The package used to compose these sentences itself: one finished English sentence per
 * change, per note, and one for a hex-density measurement — from a package with zero
 * dependencies and therefore no catalogue, in a product whose audience reads Russian
 * (B-75). What crosses now is the kind and the values; the words are here.
 *
 * Two surfaces read this table. The panel shows a change beside the buttons that act on
 * it, and the worker journals the same change so it survives the page — which is why the
 * journal stores `explainKey` and `explainArgs` rather than a sentence: `summarise` in
 * the popup resolves them at read time, so a reader who switches language sees their own
 * words on old rows instead of a record that looks like a failed translation.
 */

/** One key per kind. A literal table, so the locale gate can see every message as live. */
export const CHANGE_EXPLAIN_KEY: Record<InventoryChange['kind'], string> = {
  'newly-installed': 'extensionsChangeInstalled',
  removed: 'extensionsChangeRemoved',
  'publisher-changed': 'extensionsChangePublisher',
  'permission-added': 'extensionsChangePermission',
  'host-access-widened': 'extensionsChangeHosts',
}

/**
 * The key and its arguments for a change, never the finished sentence.
 *
 * The lists are joined here rather than in the package: a comma between two permissions
 * is punctuation, and punctuation belongs to the language it is read in. The permission
 * and host names inside them are not translated — they are what the manifest says, and
 * a person checking the extension's own listing has to find the same words.
 */
export function changeExplain(change: InventoryChange): Explained {
  const explainKey = CHANGE_EXPLAIN_KEY[change.kind]
  switch (change.kind) {
    case 'publisher-changed':
      return explained(explainKey, [
        change.name,
        party(change.publisher),
        party(change.previousPublisher),
      ])
    case 'permission-added':
      return explained(explainKey, [change.name, change.permissions.join(', ')])
    case 'host-access-widened':
      return explained(explainKey, [change.name, change.hosts.join(', ')])
    default:
      return explained(explainKey, [change.name])
  }
}

/** The sentence itself, for a surface showing it now rather than storing it. */
export function changeSentence(change: InventoryChange): string {
  const { explainKey, explainArgs } = changeExplain(change)
  return t(explainKey, ...explainArgs)
}

/**
 * A store that names no publisher.
 *
 * `null` travels from the package because "unnamed" is a fact about the listing, and the
 * words for it are a fact about the reader. Returned as a `{ messageKey }` argument rather than
 * as a resolved string, so a reader who switches language sees "an unnamed party" in
 * their own words on a row written months earlier (B-77). A publisher who *is* named
 * stays a string: their name is theirs, and translating it would invent a fact.
 */
function party(name: string | null): ExplainArg {
  return name ?? { messageKey: 'extensionsUnnamedParty' }
}

/**
 * The caveat under a package analysis: what reading the text can and cannot prove.
 *
 * Keyed on whether the file is minified, which is the only thing the note ever varied
 * on — `PackageReport` said it in a `boolean` and repeated it in a sentence, and the
 * sentence was the copy nobody could translate.
 */
export const ANALYSIS_NOTE_KEY = {
  minified: 'extensionsAnalysisMinified',
  readable: 'extensionsAnalysisReadable',
} as const

export function analysisNote(report: PackageReport): string {
  return report.minified ? t(ANALYSIS_NOTE_KEY.minified) : t(ANALYSIS_NOTE_KEY.readable)
}

/**
 * What to show beside a finding.
 *
 * Five kinds carry a verbatim excerpt from the file — the browser's text and the
 * author's, quoted rather than described, because a person checking the claim has to
 * find the same characters. `hex-density` carries a measurement instead, and a
 * measurement needs a sentence around it to mean anything.
 */
export function findingEvidence(finding: PackageFinding): string {
  return finding.kind === 'hex-density'
    ? t('extensionsHexDensity', String(finding.per100))
    : finding.evidence
}
