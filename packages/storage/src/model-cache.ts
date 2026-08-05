import type { OkolosDatabase } from './db.js'

/**
 * Where downloaded classifier weights live.
 *
 * In the same database as everything else, on purpose: a user who erases their
 * data would not expect a few dozen megabytes of model to survive it, and a
 * second storage system is a second thing to remember to wipe.
 *
 * A version is a different row rather than an overwrite, and `clear` removes
 * every version of an id — two builds of a classifier in one cache is a bug
 * nobody would notice until their verdicts disagreed.
 */

export interface ModelCacheDeps {
  readonly db: OkolosDatabase
  now(): string
}

export function createModelCache(deps: ModelCacheDeps) {
  const keyOf = (id: string, version: string) => `${id}@${version}`

  return {
    async read(id: string, version: string): Promise<ArrayBuffer | null> {
      const row = await deps.db.get('models', keyOf(id, version))
      return row?.bytes ?? null
    },

    async write(id: string, version: string, bytes: ArrayBuffer): Promise<void> {
      await deps.db.put('models', {
        key: keyOf(id, version),
        id,
        version,
        bytes,
        storedAt: deps.now(),
      })
    },

    async clear(id: string): Promise<void> {
      const keys = await deps.db.getAllKeysFromIndex('models', 'by-id', id)
      await Promise.all(keys.map((key) => deps.db.delete('models', key)))
    },
  }
}
