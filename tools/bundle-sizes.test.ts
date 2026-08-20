import { readFileSync, statSync } from 'node:fs'
import { globSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * What the shipped bundles weigh, recorded so a jump has to be argued for.
 *
 * `tools/bundle-sizes.json` carries the numbers, the date and the reasoning; this file is
 * only the comparison. The one thing worth repeating here is why a size ceiling is allowed
 * where a timing ceiling is not: a byte count is deterministic, so it reddens from code
 * rather than from a busy runner. That is the property the bench decision was missing.
 */

const root = path.resolve(import.meta.dirname, '..')
const BASELINE = JSON.parse(readFileSync(path.join(root, 'tools/bundle-sizes.json'), 'utf8')) as {
  build: string
  files: Record<string, number>
}

/** A tenth each way: room for ordinary work, no room for an accidental package. */
const BAND = 0.1

function built(): Record<string, number> {
  const dir = path.join(root, BASELINE.build)
  return Object.fromEntries(
    globSync('*.js', { cwd: dir }).map((f) => [f, statSync(path.join(dir, f)).size]),
  )
}

describe('what ships, by weight', () => {
  it('reads a build, so a missing one cannot pass as a small one', () => {
    const sizes = built()
    expect(
      Object.keys(sizes).length,
      'no bundles found — run `pnpm build` before this gate means anything',
    ).toBeGreaterThan(3)
    for (const [name, size] of Object.entries(sizes)) {
      expect(size, `${name} is empty`).toBeGreaterThan(100)
    }
  })

  it('ships exactly the bundles the baseline knows', () => {
    // A new bundle is a new thing loaded somewhere, and it should be named before it is
    // weighed. A disappeared one is a surface that stopped shipping.
    expect(Object.keys(built()).sort()).toEqual(Object.keys(BASELINE.files).sort())
  })

  it('stays inside the band, in both directions', () => {
    const drift: string[] = []
    for (const [name, expected] of Object.entries(BASELINE.files)) {
      const actual = built()[name]
      if (actual === undefined) continue
      const ratio = actual / expected
      if (ratio > 1 + BAND || ratio < 1 - BAND) {
        const sign = ratio > 1 ? '+' : ''
        drift.push(
          `${name}: ${actual} bytes against ${expected} (${sign}${Math.round((ratio - 1) * 100)}%)`,
        )
      }
    }
    expect(
      drift,
      'update tools/bundle-sizes.json in this change — up with an argument, down because the saving is real',
    ).toEqual([])
  })

  /**
   * The bundle a page pays for, called out on its own.
   *
   * `all_frames` is true, so this one is parsed once per frame of every page. It has no
   * separate ceiling — the band above is the mechanism — but it has a separate assertion,
   * because a reader scanning this file should see which number matters most.
   */
  it('keeps the per-page bundle the smallest of the two big ones', () => {
    const sizes = built()
    const content = sizes['content.js'] ?? 0
    const options = sizes['options.js'] ?? 0
    expect(content, 'content.js did not ship').toBeGreaterThan(1000)
    expect(
      content,
      'the page-side bundle has grown past the options page — check what got imported',
    ).toBeLessThan(options * 3)
  })
})
