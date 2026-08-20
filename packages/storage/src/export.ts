import type { OkolosDatabase } from './db.js'
import { STORES, WITHHELD_SETTINGS, type StoreName } from './schema.js'

export interface WipeResult {
  readonly ok: boolean
  readonly failed: readonly StoreName[]
}

/** The top-level key that states what the file does not contain. */
export const EXPORT_NOTE = '_withheld'

/** One value this file does not carry, and — for model weights — how big it was. */
export interface Withheld {
  /** Store and field, as the database names them. Not translated: it is a path. */
  readonly path: string
  /** Size of the omitted buffer, when the omission is a size rather than a secret. */
  readonly bytes?: number
}

/**
 * The words this file needs, supplied by whoever asked for it.
 *
 * The note and the marker are read by a person — this is the file they download — and
 * they were written here in English until 2026-08-20 (B-75), in a package whose
 * dependencies are `@okolos/contracts` and `idb`. Injected rather than imported: the
 * one caller is the options page, which already has the catalogue, and a storage layer
 * that reaches for a locale is a storage layer with an opinion about who is reading.
 */
export interface ExportWords {
  /** Stands where a withheld value was, so its absence is visible in the file. */
  readonly marker: (item: Withheld) => string
  /** States what the file does not contain, and why. Given every withheld value. */
  readonly note: (withheld: readonly Withheld[]) => string
}

/**
 * Everything the product holds about you, minus the two things that are not
 * about you — and it says which.
 *
 * The first version dumped every store verbatim, which read as the honest
 * choice and was the opposite. `settings` holds `reuse:key`, the HMAC key the
 * password-reuse index is tagged with, and `reuse` holds the tags. One file with
 * both halves lets whoever receives it run a dictionary of common passwords
 * against the tags and recover which password is used on which sites — the one
 * inference the index is built to keep on the device. It also carried
 * `hibp:apiKey`, the user's own paid credential, in plain text.
 *
 * So two changes, and both are about the promise rather than the plumbing. The
 * values that make the rest reversible are replaced by a marker, not silently
 * dropped: a file that quietly omits something is a file whose completeness
 * nobody can check. And the note says what was withheld and why, in the file
 * itself, because the person reading it is the person entitled to know.
 *
 * Model weights are stated rather than serialised. `JSON.stringify` renders an
 * `ArrayBuffer` as `{}`, so the previous version claimed to hold everything while
 * turning twenty megabytes into two characters — an omission that looked like
 * data. The byte count is the useful part; the bytes are a download, not a
 * fact about the user.
 */
export async function exportAll(db: OkolosDatabase, words: ExportWords): Promise<string> {
  const dump: Record<string, unknown> = {}
  const withheld: Withheld[] = []

  for (const store of STORES) {
    const rows = await db.getAll(store)

    if (store === 'settings') {
      dump[store] = rows.map((row) => {
        const entry = row as { key?: unknown; value?: unknown }
        if (typeof entry.key !== 'string' || !WITHHELD_SETTINGS.has(entry.key)) return row
        const item = { path: `settings/${entry.key}` }
        withheld.push(item)
        return { ...entry, value: words.marker(item) }
      })
      continue
    }

    if (store === 'models') {
      dump[store] = rows.map((row) => {
        const entry = row as { bytes?: unknown }
        if (!(entry.bytes instanceof ArrayBuffer)) return row
        const item = { path: 'models/bytes', bytes: entry.bytes.byteLength }
        withheld.push(item)
        return { ...entry, bytes: words.marker(item) }
      })
      continue
    }

    dump[store] = rows
  }

  dump[EXPORT_NOTE] = words.note(withheld)

  return JSON.stringify(dump, null, 2)
}

/**
 * Clears every store and reports honestly.
 *
 * A wipe that half-worked and returned success is worse than one that failed
 * outright: the user stops looking. Each store is cleared independently, the
 * failures are collected, and `ok` is true only when the list is empty.
 */
export async function wipeAll(db: OkolosDatabase): Promise<WipeResult> {
  const failed: StoreName[] = []

  for (const store of STORES) {
    try {
      await db.clear(store)
    } catch {
      failed.push(store)
    }
  }

  return { ok: failed.length === 0, failed }
}
