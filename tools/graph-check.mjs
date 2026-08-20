#!/usr/bin/env node
/**
 * Checks the graph that was saved, not the layer that produced it.
 *
 * graphify's own diagnostic reads the raw extraction, and on a two-layer build
 * that is the wrong scope: the semantic pass legitimately points at nodes the
 * AST pass supplies, so it reports edges as dangling that are nothing of the
 * kind. A run of it was read here as "225 edges point nowhere" and repeated to
 * the user before anyone measured the artefact. The saved graph had none.
 *
 * So this reads `graph.json` and answers three questions it can answer about the
 * saved artefact: does every edge land on a node that exists, was the graph built
 * from the tree that is here now, and has a code file appeared that the graph
 * connects to nothing.
 *
 * **Staleness is the one that matters most, and it used to be unasked.** A wrong
 * document gets argued with; a wrong graph gets believed, because it arrives with
 * the authority of a machine. This one was built on `ab70f5b` and read as current
 * for twelve days.
 *
 * **Orphans are reported, not gated — except the code ones.** Of the 37 in the
 * August graph, 14 were documents, 12 rationales and 7 concepts: semantic nodes the
 * extraction did not link, and demanding zero would be demanding that a heading be
 * imported by something. The four code orphans were `playwright.config.ts`,
 * `vitest.config.ts`, `tools/imports.d.mts` and a first-run `index.html` — every
 * one loaded by a runner rather than imported by a module, which is why they have no
 * edges and never will. A *new* code orphan is the interesting case: a file nothing
 * imports and which imports nothing is either dead or a hole in the extraction, and
 * both are worth a look. So that list is named below and growing it refuses.
 *
 * Not a `pnpm gates` step — `graphify-out/` is gitignored, so on a fresh clone and
 * in CI it is absent, and a gate that answers "ok" to an absent artefact is the
 * shape where absence reads as a pass. It refuses on absence instead, and runs where
 * the graph is: after `/graphify`. `docs/runbooks/development.md` records that, and
 * `tools/graph-check.test.ts` holds the record, so nobody closes the mismatch by
 * adding a step that quietly skips.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { artefactStaleness } from './build-age.mjs'

const graphPath = process.argv[2] ?? 'graphify-out/graph.json'

let graph
try {
  graph = JSON.parse(readFileSync(path.resolve(graphPath), 'utf8'))
} catch (cause) {
  console.error(`\n  No graph at ${graphPath}. Run \`/graphify\` first.\n  (${cause.message})\n`)
  process.exit(1)
}

const ids = new Set(graph.nodes.map((node) => node.id))
const links = graph.links ?? graph.edges ?? []

const dangling = links.filter((link) => !ids.has(link.source) || !ids.has(link.target))
const selfLoops = links.filter((link) => link.source === link.target)
const orphans = graph.nodes.filter(
  (node) => !links.some((link) => link.source === node.id || link.target === node.id),
)

console.log(`graph: ${graph.nodes.length} nodes, ${links.length} edges`)
console.log(`  dangling edges: ${dangling.length}`)
console.log(`  self loops:     ${selfLoops.length}`)
console.log(`  orphan nodes:   ${orphans.length}`)

for (const link of dangling.slice(0, 10)) {
  const missing = !ids.has(link.source) ? link.source : link.target
  console.log(`    ${link.source} -> ${link.target}   (missing: ${missing})`)
}

/**
 * Code files with no edges by construction: loaded by a runner, never imported.
 *
 * A list, not a count. A count says "four" and lets a fifth in by letting a first
 * one out; naming them means the gate can tell a config file from dead code.
 */
const EDGELESS_BY_DESIGN = new Set([
  'playwright.config.ts',
  'vitest.config.ts',
  'tools/imports.d.mts',
  'apps/extension/src/first-run/index.html',
])

const codeOrphans = orphans
  .filter((node) => node.file_type === 'code')
  .map((node) => node.source_file ?? String(node.id))
const unexpected = codeOrphans.filter((file) => !EDGELESS_BY_DESIGN.has(file))

/**
 * What the graph covers, and what counts as a change to it.
 *
 * Wider than a build input: the extraction reads documents and shell as well as
 * TypeScript, and a rationale node comes from a `.md`.
 */
const COVERED = ['apps', 'packages', 'tools', 'docs', 'e2e', '.githooks']
const COVERED_FILE = /\.(ts|tsx|mjs|js|py|html|json|md|css|yml)$/

/**
 * Is the graph older than the newest thing it covers?
 *
 * **Asked by file time, not by commit, and the first version asked by commit.** That
 * had two faults and CI found the loud one. `git rev-parse HEAD~1` fails outright on
 * `actions/checkout`'s shallow clone — a test about the tool that turned out to be a
 * test about the clone. The quiet fault was worse: a graph built at HEAD read as
 * fresh with any number of *uncommitted* edits under it, which is the normal state of
 * a working tree mid-task and exactly when someone reads the graph.
 *
 * `built_at_commit` is still reported, because knowing which commit it came from is
 * useful. It is no longer what decides.
 */
const staleness = artefactStaleness(path.resolve(graphPath), COVERED, COVERED_FILE)
const builtAtCommit = typeof graph.built_at_commit === 'string' ? graph.built_at_commit : null

console.log(`  code orphans:   ${codeOrphans.length} (${unexpected.length} unaccounted for)`)
const from = builtAtCommit === null ? 'an unrecorded commit' : builtAtCommit.slice(0, 7)
if (staleness.known) {
  console.log(
    staleness.stale
      ? `  built from:     ${from}, and ${staleness.newest.file} is newer than it`
      : `  built from:     ${from} — nothing it covers has changed since`,
  )
} else {
  console.log(`  built from:     unknown — ${staleness.reason}`)
}

let refused = false

if (dangling.length > 0) {
  console.error('\n  An edge to a node that does not exist is a relationship the graph cannot answer with.\n')
  refused = true
}

for (const file of unexpected) {
  console.error(`  NEW CODE ORPHAN ${file} — nothing imports it and it imports nothing`)
}
if (unexpected.length > 0) {
  console.error(
    '\n  Either it is dead and should go, or the extraction missed its edges. Both are' +
      '\n  worth a look; if it is loaded by a runner, add it to EDGELESS_BY_DESIGN with' +
      '\n  the reason.\n',
  )
  refused = true
}

if (!staleness.known) {
  console.error(`\n  Freshness could not be established: ${staleness.reason}.` +
    '\n  An unknown age is not a young age — rebuild with `/graphify . --update`.\n')
  refused = true
} else if (staleness.stale) {
  const minutes = Math.max(1, Math.round((staleness.newest.at - staleness.built) / 60_000))
  console.error(
    `\n  ${staleness.newest.file} changed ${minutes} minute(s) after the graph was built.` +
      '\n  A stale graph is a false premise carrying the authority of a machine: a wrong' +
      '\n  document gets argued with, a wrong graph gets believed. Rebuild it with' +
      '\n  `/graphify . --update` before reading anything from it.\n',
  )
  refused = true
}

if (refused) process.exit(1)
console.log('\n  OK — every edge lands on a node that exists, and the graph is the tree that is here.\n')
