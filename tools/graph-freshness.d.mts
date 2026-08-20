/**
 * Types for `graph-freshness.mjs`, hand-written for the reason `build-age.d.mts` is:
 * the gates are TypeScript and the tools are plain modules, so a `.mjs` without a
 * declaration is `any` — and `any` is how a check starts agreeing with what it is handed.
 */

export interface ManifestRow {
  readonly mtime?: number
  readonly ast_hash?: string
  readonly semantic_hash?: string
}

export interface Pending {
  /** In the graph with no semantic pass: its code is there and its meaning is not. */
  readonly awaiting: string[]
  /** Newer than the extraction that read it. */
  readonly changed: string[]
  /** Covered by the graph's scope and absent from its manifest: never extracted. */
  readonly unknown: string[]
  /** How many sources the manifest knows about at all. */
  readonly extracted: number
}

/** Which sources the graph only appears to contain. */
export function pendingSources(
  manifest: Record<string, ManifestRow>,
  covered: readonly { file: string; at: number }[],
): Pending

/** One line per non-empty state, for the gate's output. */
export function describePending(pending: {
  awaiting: string[]
  changed: string[]
  unknown: string[]
}): string[]
