import { diffInventory, type ExtensionSnapshot, type InventoryChange } from '@okolos/core-extensions'
import type { OkolosDatabase } from '@okolos/storage'

/**
 * Keeping track of what the other extensions are allowed to do.
 *
 * The snapshot is written after the comparison, never before: writing first
 * would compare a state against itself and report nothing, forever, which is
 * the kind of bug that looks exactly like "nothing has changed".
 */

export interface InventoryDeps {
  readonly db: OkolosDatabase
  list(): Promise<readonly ExtensionSnapshot[]>
  now(): string
  /** This extension's own id, so it does not report on itself. */
  readonly selfId: string
}

export async function reviewInventory(deps: InventoryDeps): Promise<InventoryChange[]> {
  const current = (await deps.list()).filter((entry) => entry.id !== deps.selfId)
  const stored = await deps.db.getAll('snapshots')

  const before: ExtensionSnapshot[] = stored.map((row) => ({
    id: row.extensionId,
    name: row.extensionId,
    version: row.version,
    permissions: [...row.permissions],
    hostPermissions: [],
    publisher: row.publisher ?? null,
    enabled: true,
  }))

  // Nothing to compare against on a first run: reporting every installed
  // extension as "newly installed" would bury the one that matters.
  const changes = stored.length === 0 ? [] : diffInventory(before, current)

  for (const entry of current) {
    await deps.db.put('snapshots', {
      extensionId: entry.id,
      takenAt: deps.now(),
      version: entry.version,
      permissions: [...entry.permissions],
      ...(entry.publisher ? { publisher: entry.publisher } : {}),
    })
  }

  for (const change of changes) {
    await deps.db.put('journal', {
      id: `extension:${change.id}:${deps.now()}`,
      createdAt: deps.now(),
      kind: 'verdict',
      detail: { explain: change.detail, kind: change.kind, severity: change.severity },
    })
  }

  return changes
}
