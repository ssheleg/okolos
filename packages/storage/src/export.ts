import type { OkolosDatabase } from './db.js'
import { STORES, type StoreName } from './schema.js'

export interface WipeResult {
  readonly ok: boolean
  readonly failed: readonly StoreName[]
}

/** Everything the product holds about you, in one readable file. */
export async function exportAll(db: OkolosDatabase): Promise<string> {
  const dump: Record<string, unknown[]> = {}
  for (const store of STORES) {
    dump[store] = await db.getAll(store)
  }
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
