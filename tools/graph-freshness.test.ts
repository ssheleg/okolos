import { describe, expect, it } from 'vitest'

import { describePending, pendingSources } from './graph-freshness.mjs'

/**
 * Which sources the graph only appears to contain.
 *
 * The question used to be a timestamp on `graph.json`, and it failed in the direction
 * that matters: graphify extracts in two passes, and a code-only rebuild rewrites the
 * file, so every source becomes older than the artefact and the gate says "nothing has
 * changed since" over documents last read twelve days earlier (B-72, 2026-08-20).
 */

const HOUR = 3_600_000

describe('a source that is in the graph with no meaning', () => {
  it('is found by an empty semantic hash, not only by a missing key', () => {
    // graphify writes `''` for a file it dispatched and could not extract, precisely so
    // the next update re-queues it. Treating empty and absent alike is what keeps a
    // failed chunk from passing for a finished one.
    const pending = pendingSources(
      { 'docs/a.md': { mtime: 1, ast_hash: 'x', semantic_hash: '' } },
      [{ file: 'docs/a.md', at: 1000 }],
    )
    expect(pending.awaiting).toEqual(['docs/a.md'])
    expect(pending.changed).toEqual([])
  })

  it('is not confused with one that has been extracted', () => {
    const pending = pendingSources(
      { 'docs/a.md': { mtime: 10, semantic_hash: 'abc' } },
      [{ file: 'docs/a.md', at: 10_000 }],
    )
    expect(pending.awaiting).toEqual([])
  })
})

describe('a source that changed after it was read', () => {
  it('is found by comparing its mtime to the extraction that recorded it', () => {
    const pending = pendingSources(
      { 'src/a.ts': { mtime: 1000, semantic_hash: 'x' } },
      [{ file: 'src/a.ts', at: (1000 + HOUR / 1000) * 1000 }],
    )
    expect(pending.changed).toEqual(['src/a.ts'])
  })

  it('allows one second of slack, because a same-second write proves nothing', () => {
    // The failure this catches is measured in days. A file written in the same second as
    // the run that read it would otherwise make every fresh graph report itself stale.
    const pending = pendingSources(
      { 'src/a.ts': { mtime: 1000, semantic_hash: 'x' } },
      [{ file: 'src/a.ts', at: 1000_500 }],
    )
    expect(pending.changed).toEqual([])
  })

  it('says nothing about a row with no recorded mtime', () => {
    // An older manifest format, or a row written by a different path. Absence of a
    // timestamp is not evidence of freshness *or* of staleness, and inventing either is
    // worse than the silence.
    const pending = pendingSources(
      { 'src/a.ts': { semantic_hash: 'x' } },
      [{ file: 'src/a.ts', at: 9_999_999 }],
    )
    expect(pending.changed).toEqual([])
  })
})

describe('a covered source with no manifest row at all', () => {
  it('is reported as never extracted, not as unchanged', () => {
    // The quiet one: a file the graph's scope claims and its extraction never saw is
    // invisible to any comparison that iterates the manifest.
    const pending = pendingSources({}, [{ file: 'docs/new.md', at: 1 }])
    expect(pending.unknown).toEqual(['docs/new.md'])
  })

  it('counts what the manifest does know, so an empty manifest is visible as empty', () => {
    expect(pendingSources({}, []).extracted).toBe(0)
    expect(pendingSources({ 'a.ts': { semantic_hash: 'x' } }, []).extracted).toBe(1)
  })
})

describe('what the gate prints', () => {
  it('names each state separately, because they are unblocked differently', () => {
    /**
     * "36 sources pending" hides that half of them are waiting on an LLM pass nobody can
     * run from a shell. Telling someone to re-run the update when their blocker is a
     * missing key sends them round the loop again.
     */
    const lines = describePending({
      awaiting: ['docs/a.md'],
      changed: ['src/b.ts'],
      unknown: ['docs/c.md'],
    })
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('semantic')
    expect(lines[1]).toContain('newer')
    expect(lines[2]).toContain('no manifest row')
  })

  it('says nothing when there is nothing to say', () => {
    // An empty list, not a line reading "0 pending": a gate that prints a reassurance on
    // every run is a gate whose output stops being read.
    expect(describePending({ awaiting: [], changed: [], unknown: [] })).toEqual([])
  })

  it('quotes one example per state, so the reader has somewhere to look', () => {
    const lines = describePending({ awaiting: ['docs/first.md', 'docs/second.md'], changed: [], unknown: [] })
    expect(lines[0]).toContain('docs/first.md')
    expect(lines[0]).toContain('2 source(s)')
  })
})
