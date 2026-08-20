/**
 * Which sources the graph actually contains, and which it only appears to.
 *
 * The first version of this question was a timestamp: is `graph.json` older than the
 * newest file it covers? That proxy has two failure modes and both were observed on
 * 2026-08-20 while closing B-72.
 *
 * It reads as **stale** on an edit to any covered file, including the one being made
 * while reading the graph — true, and useless as a gate.
 *
 * Worse, it reads as **fresh** after a partial rebuild. graphify's extraction has two
 * halves: an AST pass over code, which is deterministic and free, and a semantic pass
 * over documents and images, which needs an LLM. A code-only update rewrites
 * `graph.json`, so every covered file is older than the artefact and the timestamp says
 * "nothing has changed since" — while 27 documents in that same graph were extracted
 * twelve days earlier. A wrong document gets argued with; a wrong graph gets believed.
 *
 * So the question is asked per source, of graphify's own manifest: every extracted file
 * with the mtime and the hashes it was extracted at. Three ways a source can be missing
 * from the graph it appears to be in, and they are different failures:
 *
 *   - **awaiting** — the file is in the manifest with no `semantic_hash`. graphify
 *     clears that field for a file it dispatched and could not extract, precisely so the
 *     next update re-queues it. Its code side may be present and its meaning is not.
 *   - **changed** — the file is newer than the extraction that read it.
 *   - **unknown** — a covered file with no manifest row at all: never extracted.
 */

/** @typedef {{ mtime?: number, ast_hash?: string, semantic_hash?: string }} ManifestRow */

/**
 * @param {Record<string, ManifestRow>} manifest
 * @param {readonly {file: string, at: number}[]} covered current mtimes, ms since epoch
 * @returns {{awaiting: string[], changed: string[], unknown: string[], extracted: number}}
 */
export function pendingSources(manifest, covered) {
  const awaiting = []
  const changed = []
  const unknown = []

  for (const [file, row] of Object.entries(manifest)) {
    // An empty string, not an absent key: graphify writes `''` to say "dispatched and
    // not extracted". Treating absent and empty alike is what keeps a failed chunk
    // from passing for a finished one.
    if (!row.semantic_hash) awaiting.push(file)
  }

  const rows = new Map(Object.entries(manifest))
  for (const { file, at } of covered) {
    const row = rows.get(file)
    if (row === undefined) {
      unknown.push(file)
      continue
    }
    // Seconds in the manifest, milliseconds from the filesystem. One second of slack,
    // because a file written in the same second as the extraction that read it is not
    // evidence of anything — and the failure this catches is measured in days.
    if (typeof row.mtime === 'number' && at / 1000 > row.mtime + 1) changed.push(file)
  }

  return {
    awaiting: awaiting.sort(),
    changed: changed.sort(),
    unknown: unknown.sort(),
    extracted: rows.size,
  }
}

/**
 * One line per state, or null when there is nothing to say.
 *
 * Named counts rather than a single number: "36 sources pending" hides that half of
 * them are waiting on an LLM pass nobody can run from a shell, which is the fact that
 * decides what to do next.
 *
 * @param {{awaiting: string[], changed: string[], unknown: string[]}} pending
 * @returns {string[]}
 */
export function describePending(pending) {
  const lines = []
  if (pending.awaiting.length > 0) {
    lines.push(
      `  awaiting meaning: ${pending.awaiting.length} source(s) are in the graph with no` +
        ` semantic pass — e.g. ${pending.awaiting[0]}`,
    )
  }
  if (pending.changed.length > 0) {
    lines.push(
      `  changed since:    ${pending.changed.length} source(s) are newer than the extraction` +
        ` that read them — e.g. ${pending.changed[0]}`,
    )
  }
  if (pending.unknown.length > 0) {
    lines.push(
      `  never extracted:  ${pending.unknown.length} covered source(s) have no manifest row` +
        ` — e.g. ${pending.unknown[0]}`,
    )
  }
  return lines
}
