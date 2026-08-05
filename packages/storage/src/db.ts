import { openDB, type IDBPDatabase } from 'idb'

import { DB_NAME, DB_VERSION, type OkolosDB } from './schema.js'

export type OkolosDatabase = IDBPDatabase<OkolosDB>

let handle: OkolosDatabase | null = null

/**
 * One connection per context. The background worker is torn down and restarted
 * by the browser at will, so nothing may live in memory between calls — but
 * within a single wake-up, reopening on every read would be wasteful.
 */
export async function openDb(): Promise<OkolosDatabase> {
  if (handle) return handle

  handle = await openDB<OkolosDB>(DB_NAME, DB_VERSION, {
    upgrade(db, from) {
      // Each version adds only what is missing. An upgrade that recreated the
      // stores would erase a user's findings to add a column.
      if (from > 0 && db.objectStoreNames.contains('findings')) {
        if (from < 2) addModelStore(db)
        if (from < 3) addFeedStore(db)
        return
      }

      const findings = db.createObjectStore('findings', { keyPath: 'id' })
      findings.createIndex('by-created', 'createdAt')
      findings.createIndex('by-subject', 'subject')

      const journal = db.createObjectStore('journal', { keyPath: 'id' })
      journal.createIndex('by-created', 'createdAt')
      journal.createIndex('by-kind', 'kind')

      const outbound = db.createObjectStore('outbound_log', { keyPath: 'id' })
      outbound.createIndex('by-created', 'createdAt')
      outbound.createIndex('by-purpose', 'purpose')

      const exceptions = db.createObjectStore('exceptions', { keyPath: ['scope', 'ref'] })
      exceptions.createIndex('by-created', 'createdAt')

      db.createObjectStore('settings', { keyPath: 'key' })
      db.createObjectStore('snapshots', { keyPath: 'extensionId' })
      addModelStore(db)
      addFeedStore(db)
    },
  })

  return handle
}

function addModelStore(db: IDBPDatabase<OkolosDB>): void {
  if (db.objectStoreNames.contains('models')) return
  const models = db.createObjectStore('models', { keyPath: 'key' })
  models.createIndex('by-id', 'id')
}

function addFeedStore(db: IDBPDatabase<OkolosDB>): void {
  if (db.objectStoreNames.contains('feeds')) return
  db.createObjectStore('feeds', { keyPath: 'name' })
}

export function closeDb(): void {
  handle?.close()
  handle = null
}
