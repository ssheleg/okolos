import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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

function run(graph: unknown): { code: number; out: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'okolos-graph-'))
  const file = path.join(dir, 'graph.json')
  writeFileSync(file, JSON.stringify(graph))
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
    nodes: [
      { id: 'a', file_type: 'code', source_file: 'a.ts' },
      { id: 'b', file_type: 'code', source_file: 'b.ts' },
    ],
    links: [{ source: 'a', target: 'b' }],
    ...overrides,
  }
}

describe('the code-graph check', () => {
  it('passes a graph built from the tree that is here', () => {
    const { code, out } = run(healthy())
    expect(code, out).toBe(0)
    expect(out).toContain('the tree that is here now')
  })

  it('refuses an edge that lands on nothing', () => {
    const { code, out } = run(healthy({ links: [{ source: 'a', target: 'ghost' }] }))
    expect(code).toBe(1)
    expect(out).toContain('ghost')
  })

  it('refuses a graph built before the tree changed', () => {
    /**
     * The check the tool did not have. `HEAD~1` is one commit back, so at least the
     * files of that commit differ — which is the whole condition being tested.
     */
    const older = execFileSync('git', ['rev-parse', 'HEAD~1'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
    const { code, out } = run(healthy({ built_at_commit: older }))
    expect(code).toBe(1)
    expect(out).toContain('file(s) have changed since')
  })

  it('refuses a graph that cannot say when it was built', () => {
    // Standing instruction 3, at the level of a whole artefact: an unknown age is
    // not a young age, and reporting one as the other is how the twelve days passed.
    const graph = healthy()
    delete (graph as { built_at_commit?: string }).built_at_commit
    const { code, out } = run(graph)
    expect(code).toBe(1)
    expect(out).toContain('unknown')
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
