import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The checks on the code graph, and the record of why it is not a `gates` step.
 *
 * For its first weeks this tool asked one question — does every edge land on a node
 * that exists — and answered it about a graph built twelve days and 209 files
 * earlier. Nothing was wrong with the answer. The premise was.
 */

const root = path.resolve(import.meta.dirname, '..')
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()

/**
 * Writes a graph and runs the check against it.
 *
 * `builtAt` stamps the file's mtime, because that is what the freshness question is
 * now asked of. The first version asked git — `git rev-parse HEAD~1` — and that made
 * this a test about the clone: it passes locally and fails outright on
 * `actions/checkout`, whose default depth is 1. It also let a graph built at HEAD
 * with uncommitted edits under it read as fresh, which is the normal state of a
 * working tree and exactly when someone reads a graph.
 */
function run(graph: unknown, builtAt?: number): { code: number; out: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'okolos-graph-'))
  const file = path.join(dir, 'graph.json')
  writeFileSync(file, JSON.stringify(graph))
  if (builtAt !== undefined) utimesSync(file, builtAt / 1000, builtAt / 1000)
  try {
    const out = execFileSync('node', [path.join(root, 'tools/graph-check.mjs'), file], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (cause) {
    const failed = cause as { status?: number; stdout?: string; stderr?: string }
    return { code: failed.status ?? -1, out: `${failed.stdout ?? ''}${failed.stderr ?? ''}` }
  }
}

/** Two nodes, one edge between them: the smallest graph with nothing wrong. */
function healthy(overrides: Record<string, unknown> = {}) {
  return {
    built_at_commit: head,
    // Reported, not load-bearing: the check asks the file's age, not this string.
    nodes: [
      { id: 'a', file_type: 'code', source_file: 'a.ts' },
      { id: 'b', file_type: 'code', source_file: 'b.ts' },
    ],
    links: [{ source: 'a', target: 'b' }],
    ...overrides,
  }
}

describe('the code-graph check', () => {
  it('passes a graph newer than everything it covers', () => {
    // An hour ahead rather than "now": a file written by another test in this same
    // run must not be able to make a fresh graph look stale.
    const { code, out } = run(healthy(), Date.now() + 60 * 60_000)
    expect(code, out).toBe(0)
    expect(out).toContain('nothing it covers has changed since')
  })

  it('refuses an edge that lands on nothing', () => {
    const { code, out } = run(
      healthy({ links: [{ source: 'a', target: 'ghost' }] }),
      Date.now() + 60 * 60_000,
    )
    expect(code).toBe(1)
    expect(out).toContain('ghost')
  })

  it('refuses a graph built before the tree changed', () => {
    // A year old: older than anything in the tree, on any machine, with no history
    // to consult. The condition under test is "the tree moved after the graph did".
    const { code, out } = run(healthy(), Date.now() - 365 * 24 * 60 * 60_000)
    expect(code).toBe(1)
    expect(out).toContain('minute(s) after the graph was built')
  })

  it('does not need repository history to answer', () => {
    /**
     * The reason this file changed shape. The first version ran
     * `git rev-parse HEAD~1`, which fails on a shallow clone — so a test about the
     * tool became a test about the checkout, green locally and red on CI within the
     * hour. Nothing in the tool may reach for git now, and this asserts that rather
     * than trusting it.
     */
    const tool = readFileSync(path.join(root, 'tools/graph-check.mjs'), 'utf8')
    // The import, not the word. Asserting the file never says "rev-parse" failed on
    // the paragraph above explaining why it must not run one — a negative assertion
    // about a mention, which is the same weak discriminator as a positive one.
    expect(tool).not.toMatch(/from 'node:child_process'/)
    expect(tool).not.toMatch(/execFileSync\(/)
  })

  it('reports which commit it came from without deciding on it', () => {
    // Useful to know, and not the answer: a graph built at HEAD can have a working
    // tree of uncommitted edits under it, which the commit comparison called fresh.
    const { out } = run(healthy(), Date.now() + 60 * 60_000)
    expect(out).toContain(head.slice(0, 7))
  })

  it('names an unrecorded commit rather than inventing one', () => {
    // Standing instruction 3 at the level of a field: not knowing which commit is
    // not the same as knowing, and the line must say so out loud.
    const graph = healthy()
    delete (graph as { built_at_commit?: string }).built_at_commit
    const { code, out } = run(graph, Date.now() + 60 * 60_000)
    expect(code, out).toBe(0)
    expect(out).toContain('an unrecorded commit')
  })

  it('names a code file the graph connects to nothing', () => {
    const { code, out } = run(
      healthy({
        nodes: [
          { id: 'a', file_type: 'code', source_file: 'a.ts' },
          { id: 'b', file_type: 'code', source_file: 'b.ts' },
          { id: 'c', file_type: 'code', source_file: 'packages/lost/src/index.ts' },
        ],
      }),
      Date.now() + 60 * 60_000,
    )
    expect(code).toBe(1)
    expect(out).toContain('packages/lost/src/index.ts')
  })

  it('leaves a config file alone, and a heading with no edges', () => {
    /**
     * The distinction that keeps the rule usable. `vitest.config.ts` is loaded by a
     * runner and imported by nothing, so it has no edges and never will; a document
     * node is a heading, and demanding that a heading be imported is how a gate
     * teaches people to stop reading it.
     */
    const { code, out } = run(
      healthy({
        nodes: [
          { id: 'a', file_type: 'code', source_file: 'a.ts' },
          { id: 'b', file_type: 'code', source_file: 'b.ts' },
          { id: 'cfg', file_type: 'code', source_file: 'vitest.config.ts' },
          { id: 'doc', file_type: 'document', source_file: 'docs/README.md' },
        ],
      }),
      Date.now() + 60 * 60_000,
    )
    expect(code, out).toBe(0)
    expect(out).toContain('code orphans:   1 (0 unaccounted for)')
  })

  it('stays out of the gate chain, with the reason written down', () => {
    /**
     * `graphify-out/` is gitignored, so in CI the artefact is absent — and a step
     * that answers "ok" to an absent artefact is absence reading as a pass. The
     * exclusion is deliberate, so it is recorded rather than remembered: without
     * this test the next reader sees a linter missing from `gates` and adds it.
     */
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts.gates).not.toContain('graph:check')
    const runbook = readFileSync(path.join(root, 'docs/runbooks/development.md'), 'utf8')
    expect(runbook).toContain('Почему `graph:check` в `gates` нет')
    expect(runbook).toContain('gitignore')
  })
})
