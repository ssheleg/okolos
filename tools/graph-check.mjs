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
 * So this reads `graph.json` and answers the only question that matters: does
 * every edge land on a node that exists.
 *
 * Not a repository gate — `graphify-out/` is gitignored and absent on a fresh
 * clone. It is a command to run after rebuilding the graph.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

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

if (dangling.length > 0) {
  console.error('\n  An edge to a node that does not exist is a relationship the graph cannot answer with.\n')
  process.exit(1)
}
console.log('\n  OK — every edge lands on a node that exists.\n')
