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
 * The instant, for a fact that is a moment.
 *
 * "Changed since": a diff has a baseline, and the baseline is a point in time rather than a
 * day. The digits stay language-neutral on purpose — a half-localised date is worse than an
 * unambiguous one — while the sentence around them comes from the catalogue.
 */
export function shortTime(iso: string): string {
  return iso.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}
