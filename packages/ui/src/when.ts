/**
 * How a stored instant reaches a person, in one place.
 *
 * There were three answers and a hole. `trusted.ts` had a private `shortDate`, `popup.ts` a
 * private `shortTime`, `dashboard/overview.ts` grew a third copy of the first on 2026-08-21,
 * and `options/index.ts` had none at all — it passed the stored value straight into a
 * sentence, so the dashboard's journal row read "Что изменилось с
 * 2026-08-20T23:23:22.936Z". Found by regenerating the store screenshots and looking at
 * them twice: the first look caught the attention band, the second caught this.
 *
 * Both renderings are kept, because they answer different questions, and each keeps the
 * reasoning it was written with.
 */

/**
 * The day, for a fact whose hour is noise.
 *
 * "Granted on", "last checked": the difference that matters is today against three weeks
 * ago, and an hour in that sentence is precision nobody asked for. This is also the shape
 * the storage layer already uses when it keeps a date rather than an instant — the reuse
 * index and the "seen this host" note both store ten characters, for the same reason.
 */
export function shortDate(iso: string): string {
  return iso.slice(0, 10)
}

/**
 * The instant, for a fact that is a moment — to the minute.
 *
 * "Changed since": a diff has a baseline, and the baseline is a point in time rather than a
 * day. The digits stay language-neutral on purpose — a half-localised date is worse than an
 * unambiguous one — while the sentence around them comes from the catalogue.
 *
 * **The seconds came off on 2026-08-21.** "Ничего нового с 2026-08-21 01:36:17 UTC" was
 * precision nobody asked for in a sentence about whether anything happened, and the popup
 * and the dashboard printed the same instant to the second within one screen of each other.
 * A person reading "since when" needs the minute; the one place that genuinely needs seconds
 * is the audit log, whose whole purpose is being compared against a browser network trace,
 * and it says so by calling `exactInstant`.
 */
export function shortTime(iso: string): string {
  // A value that carries no time is returned as it came: the storage layer keeps some
  // dates as ten characters already, and " UTC" after a bare day is a claim about an hour
  // nobody recorded. The first version of this appended it unconditionally and the existing
  // test caught it — the contract was written down before the mistake was available to make.
  const at = iso.indexOf('T')
  return at === -1 ? iso : `${iso.slice(0, at)} ${iso.slice(at + 1, at + 6)} UTC`
}

/**
 * The instant to the second, for a record meant to be checked against another record.
 *
 * The self-audit log is the product's central claim made verifiable: a reader lines its rows
 * up against what their browser's own network panel says. Dropping the seconds there would
 * cost them the one field that makes two logs comparable — so this is not `shortTime` with
 * a suffix, it is a different question with a different answer.
 */
export function exactInstant(iso: string): string {
  return iso.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}
