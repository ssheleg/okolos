import type { OkolosDatabase } from './db.js'
import { STORES, WITHHELD_MARKER, WITHHELD_SETTINGS, type StoreName } from './schema.js'

export interface WipeResult {
  readonly ok: boolean
  readonly failed: readonly StoreName[]
}

/** The top-level key that states what the file does not contain. */
export const EXPORT_NOTE = '_withheld'

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
export async function exportAll(db: OkolosDatabase): Promise<string> {
  const dump: Record<string, unknown> = {}
  const withheld: string[] = []

  for (const store of STORES) {
    const rows = await db.getAll(store)

    if (store === 'settings') {
      dump[store] = rows.map((row) => {
        const entry = row as { key?: unknown; value?: unknown }
        if (typeof entry.key !== 'string' || !WITHHELD_SETTINGS.has(entry.key)) return row
        withheld.push(`settings/${entry.key}`)
        return { ...entry, value: WITHHELD_MARKER }
      })
      continue
    }

    if (store === 'models') {
      dump[store] = rows.map((row) => {
        const entry = row as { bytes?: unknown }
        if (!(entry.bytes instanceof ArrayBuffer)) return row
        withheld.push(`models/bytes (${entry.bytes.byteLength} bytes)`)
        return { ...entry, bytes: `${WITHHELD_MARKER} — ${entry.bytes.byteLength} bytes` }
      })
      continue
    }

    dump[store] = rows
  }

  dump[EXPORT_NOTE] =
    withheld.length === 0
      ? 'Nothing was withheld from this file.'
      : `Withheld from this file: ${withheld.join(', ')}. ` +
        `A key that makes the rest of this file readable is not a fact about you — ` +
        `exported beside the data it protects it would let whoever holds this file ` +
        `recover what the data is for. Model weights are named by size rather than ` +
        `included: they are a download, not something the product learned about you.`

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
