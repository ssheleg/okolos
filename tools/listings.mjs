/**
 * The rows the public status page answers from, derived from the feed the
 * extension blocks on.
 *
 * Pure on purpose: `publish-feed.mjs` performs the upload, this file decides
 * what the upload should say, and the tests read that decision back. The two
 * tables diverged once already because publishing wrote one of them.
 */

/**
 * The host a feed entry is about.
 *
 * Entries may narrow to a path (`evil.test/login`) — the block is path-scoped,
 * but an owner asks about their site, so the listing is by host. Returns null
 * for anything that is not a public hostname, which the caller turns into a
 * refusal rather than a row nobody can act on.
 */
export function hostOf(entry) {
  if (typeof entry !== 'string') return null
  const trimmed = entry.trim().toLowerCase()
  if (trimmed === '') return null

  let hostname
  try {
    hostname = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname
  } catch {
    return null
  }
  hostname = hostname.replace(/\.$/, '')

  // The same bar the worker holds in `normaliseDomain`: a public host has at
  // least two labels, and every label is non-empty.
  const labels = hostname.split('.')
  if (labels.length < 2 || labels.some((label) => label === '')) return null
  return hostname
}

const quoted = (value) => `'${value}'`

/**
 * The SQL that makes `listings` agree with this feed update.
 *
 * A snapshot is the whole answer for its feed, so rows it no longer carries are
 * swept. A delta says nothing about the entries it does not mention, so it only
 * adds and removes — sweeping on a delta would un-list every domain it happens
 * to be silent about.
 *
 * `entry_date` is written once and never rewritten: it is the date an owner
 * quotes, and refreshing it on every republish makes every listing look new.
 * It is a date, not an instant — we know the day a listing appeared, and
 * "recorded 2026-08-08T07:33:50.218Z" is machine output shown to a person.
 */
export function listingSql(update, publishedAt) {
  const entryDate = String(publishedAt).slice(0, 10)
  const feed = update?.body?.name
  if (typeof feed !== 'string' || feed === '' || /['\\]/.test(feed)) {
    throw new Error(`publish-feed: unusable feed name ${JSON.stringify(feed)}`)
  }

  const hosts = (entries) =>
    entries.map((entry) => {
      const host = hostOf(entry)
      if (host === null) throw new Error(`publish-feed: ${JSON.stringify(entry)} is not a domain`)
      return host
    })

  const insert = (list) =>
    list.length === 0
      ? ''
      : `INSERT INTO listings (domain, feed, entry_date) VALUES\n` +
        `${list.map((h) => `  (${quoted(h)},${quoted(feed)},${quoted(entryDate)})`).join(',\n')}\n` +
        `ON CONFLICT(domain) DO UPDATE SET feed = excluded.feed;\n`

  // The column holds a date. Rows written before that was true are repaired on
  // every publish rather than by a migration someone has to remember to run.
  const repair =
    'UPDATE listings SET entry_date = substr(entry_date, 1, 10) WHERE length(entry_date) > 10;\n'

  if (update.kind === 'snapshot') {
    const list = [...new Set(hosts(update.body.entries ?? []))]
    const sweep =
      list.length === 0
        ? `DELETE FROM listings\n  WHERE feed = ${quoted(feed)};\n`
        : `DELETE FROM listings\n  WHERE feed = ${quoted(feed)}\n` +
          `    AND domain NOT IN (${list.map(quoted).join(',')});\n`
    return `${repair}${sweep}${insert(list)}`
  }

  const added = [...new Set(hosts(update.body.added ?? []))]
  const removed = [...new Set(hosts(update.body.removed ?? []))]
  const drop =
    removed.length === 0
      ? ''
      : `DELETE FROM listings WHERE feed = ${quoted(feed)} AND domain IN (${removed.map(quoted).join(',')});\n`
  return `${repair}${drop}${insert(added)}`
}
