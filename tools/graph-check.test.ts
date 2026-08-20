import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { filesUnderWithTime } from './build-age.mjs'

/**
 * The scope the check itself uses, restated here on purpose.
 *
 * Two copies of a list is normally the drift this repository refuses — but the point of
 * the last two assertions in this file is that this list and the extraction's own output
 * agree. A shared constant would make them agree by construction and prove nothing.
 */
const COVERED = ['apps', 'packages', 'tools', 'docs', 'e2e', '.githooks']
const COVERED_FILE = /(\.(ts|mts|mjs|js|py|html|json|md|yml|yaml|sql)|^pre-[a-z]+)$/

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
function run(
  graph: unknown,
  builtAt?: number,
  manifest?: Record<string, unknown> | null,
): { code: number; out: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'okolos-graph-'))
  const file = path.join(dir, 'graph.json')
  writeFileSync(file, JSON.stringify(graph))
  if (builtAt !== undefined) utimesSync(file, builtAt / 1000, builtAt / 1000)
  // The manifest sits beside the graph, and that is where the per-source question is
  // asked. `undefined` means "a complete one", `null` means "none written" — which is
  // its own refusal, because with no manifest nothing can be said about what is in there.
  if (manifest !== null) {
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest ?? complete()))
  }
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

/**
 * A manifest that accounts for every source the graph covers, extracted just now.
 *
 * Built from the real tree rather than hand-written, because the check compares the
 * manifest against the tree: a fixed list would pass this file and say nothing about
 * whether the walk and the manifest agree. Every row is stamped a day ahead, so no real
 * file can read as "changed after it was extracted" while the suite runs.
 */
function complete(): Record<string, { mtime: number; ast_hash: string; semantic_hash: string }> {
  const tomorrow = Date.now() / 1000 + 86_400
  const rows: Record<string, { mtime: number; ast_hash: string; semantic_hash: string }> = {}
  for (const { file } of filesUnderWithTime(COVERED, COVERED_FILE)) {
    rows[file] = { mtime: tomorrow, ast_hash: 'x', semantic_hash: 'x' }
  }
  return rows
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

  it('reports the file being older than the tree, and does not refuse for it', () => {
    /**
     * The timestamp stopped deciding on 2026-08-20. It cannot tell "the graph is twelve
     * days old" from "a file was edited a minute ago", which on a working tree mid-task
     * is every run — and it answered *fresh* for the one case that mattered: a code-only
     * rebuild rewrites `graph.json`, so every source becomes older than the artefact
     * while the documents inside it are weeks stale. It is a note now.
     */
    const { code, out } = run(healthy(), Date.now() - 365 * 24 * 60 * 60_000)
    expect(code, out).toBe(0)
    expect(out).toContain('the per-source check above is what decides')
  })

  it('refuses a source the graph appears to contain and does not', () => {
    // The defect the per-source check exists for, in each of its three shapes. The graph
    // file is a day *ahead* of the tree in every case, so the timestamp would call all
    // three fresh.
    const ahead = Date.now() + 24 * 60 * 60_000
    const tomorrow = Date.now() / 1000 + 86_400

    const awaiting = complete()
    const someDoc = Object.keys(awaiting).find((f) => f.endsWith('.md')) as string
    awaiting[someDoc] = { mtime: tomorrow, ast_hash: 'x', semantic_hash: '' }
    const one = run(healthy(), ahead, awaiting)
    expect(one.code, one.out).toBe(1)
    expect(one.out).toContain('awaiting meaning')
    expect(one.out).toContain('needs an LLM')

    const changed = complete()
    changed[someDoc] = { mtime: 1, ast_hash: 'x', semantic_hash: 'x' }
    const two = run(healthy(), ahead, changed)
    expect(two.code, two.out).toBe(1)
    expect(two.out).toContain('changed since')

    const missing = complete()
    delete missing[someDoc]
    const three = run(healthy(), ahead, missing)
    expect(three.code, three.out).toBe(1)
    expect(three.out).toContain('never extracted')
  })

  it('refuses when there is no manifest at all', () => {
    // An unknown set of sources is not an empty one. Without the manifest the check
    // cannot say what is in the graph, and a gate that passes on "cannot say" is the
    // absence-reads-as-a-pass failure this project refuses everywhere.
    const { code, out } = run(healthy(), Date.now() + 60 * 60_000, null)
    expect(code, out).toBe(1)
    expect(out).toContain('No manifest beside the graph')
  })

  it('claims every file type the extraction reads, and no type it does not', () => {
    /**
     * Both directions, because they fail differently and all three have happened.
     *
     * `.css` was claimed and is not in graphify's detection, so two stylesheets sat
     * permanently in "never extracted" — a gap in the pattern reported as a gap in the
     * graph, burying nine real documents in the same list. `.tsx` was claimed and this
     * project has none: dead weight reading as coverage. And `.githooks/pre-push` is
     * extracted and was not claimed, because a git hook carries no extension — so the
     * check silently never asked about the hook that runs every other gate.
     *
     * **Measured, not live.** The first version of this read
     * `graphify-out/manifest.json`, which is git-ignored and absent on a fresh clone: it
     * passed here and failed CI within the hour — a test about my machine wearing the
     * clothes of a test about the rule, which is the same shape as the `git rev-parse
     * HEAD~1` failure this file already carries a note about. The list below is a
     * recorded measurement with its command and its date; the live cross-check is the
     * assertion after it, and it says so when it cannot run.
     *
     * Measured 2026-08-20 by:
     *   python3 -c "import json,collections;print(collections.Counter(
     *     k.rsplit('.',1)[-1] for k in json.load(open('graphify-out/manifest.json'))))"
     */
    const EXTRACTS = ['ts', 'md', 'json', 'mjs', 'mts', 'png', 'html', 'py', 'js', 'sql', 'yml', 'yaml']

    // `png` is extracted and deliberately unclaimed: an image has no text to go stale,
    // and "which images changed" is not a question this check answers.
    const blind = EXTRACTS.filter((ext) => ext !== 'png' && !COVERED_FILE.test(`x.${ext}`))
    expect(blind, `extracted and unclaimed: ${blind.join(', ')}`).toEqual([])

    const claimed = [...COVERED_FILE.source.matchAll(/[a-z]{2,}/g)].map((m) => m[0])
    const dead = claimed.filter((ext) => !EXTRACTS.includes(ext) && !ext.startsWith('pre'))
    expect(dead, `claimed and never extracted: ${dead.join(', ')}`).toEqual([])
  })

  it('holds that measurement against the live manifest, where there is one', () => {
    /**
     * The other half, and it refuses to be silent about not running.
     *
     * `graphify-out/` is git-ignored, so on CI and on a fresh clone there is nothing to
     * compare against. That is not a pass: a skipped assertion is exactly how the list
     * above would rot into a decoration. So the absence is asserted *as* absence — this
     * test states which of the two worlds it is in, and the recorded list carries the
     * date it was measured on for the world where it cannot be checked.
     */
    const manifestPath = path.join(root, 'graphify-out/manifest.json')
    if (!existsSync(manifestPath)) {
      // Nothing to check, and the reason is structural rather than a failure. The
      // recorded list above is what stands in for it, dated.
      expect(existsSync(path.join(root, 'graphify-out'))).toBe(false)
      return
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    // By basename: `split('.').pop()` on an extensionless git hook hands back the whole
    // path, which then reads as an unclaimed file type.
    const names = Object.keys(manifest).map((f) => f.split('/').pop() ?? f)
    const unclaimed = names.filter((name) => !name.endsWith('.png') && !COVERED_FILE.test(name))
    expect(unclaimed, `extracted and unclaimed: ${[...new Set(unclaimed)].join(', ')}`).toEqual([])
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
