import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { SURFACES, surfacesDigest } from './surfaces.mjs'

/**
 * The digest that decides whether the store screenshots still show the product.
 *
 * Its two failure directions are opposite and both real. Too *sensitive*, and the gate
 * demands a re-shoot for work that cannot appear in an image — or worse, disagrees between
 * two machines looking at identical code, which is how a `.DS_Store` took down the only
 * load-bearing gate this project has (B-58). Too *blind*, and a listing keeps showing a
 * screen the product no longer draws.
 *
 * So the boundaries are tested rather than described: a real edit must move it, and the
 * three things that are not the product must not.
 */

const roots: string[] = []

/** A tree shaped like the repository's surfaces, and nothing else. */
function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'okolos-surfaces-'))
  roots.push(root)
  for (const surface of SURFACES) {
    const absolute = path.join(root, surface)
    if (path.extname(surface) === '') {
      mkdirSync(absolute, { recursive: true })
      writeFileSync(path.join(absolute, 'index.ts'), 'export const a = 1\n')
      writeFileSync(path.join(absolute, 'index.test.ts'), 'it("a", () => {})\n')
    } else {
      mkdirSync(path.dirname(absolute), { recursive: true })
      writeFileSync(absolute, ':root { --x: 1px }\n')
    }
  }
  return root
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

describe('the surface digest', () => {
  it('names paths that are actually there', () => {
    const repo = path.resolve(import.meta.dirname, '..')
    expect(SURFACES.filter((surface) => !existsSync(path.join(repo, surface)))).toEqual([])
  })

  it('answers the same twice for the same tree', () => {
    const root = fixture()
    expect(surfacesDigest(root)).toBe(surfacesDigest(root))
  })

  it('moves when a surface file changes', () => {
    const root = fixture()
    const before = surfacesDigest(root)
    writeFileSync(path.join(root, 'packages/ui/src/index.ts'), 'export const a = 2\n')
    expect(surfacesDigest(root)).not.toBe(before)
  })

  it('moves when the style sheet changes, which is a file rather than a directory', () => {
    const root = fixture()
    const before = surfacesDigest(root)
    writeFileSync(path.join(root, 'apps/extension/src/pages.css'), ':root { --x: 2px }\n')
    expect(surfacesDigest(root)).not.toBe(before)
  })

  it('moves when a file is renamed with its content intact', () => {
    // Imports move with a rename, and a screen can stop being rendered at all — so the
    // path goes into the hash beside the bytes.
    const root = fixture()
    const before = surfacesDigest(root)
    rmSync(path.join(root, 'packages/ui/src/index.ts'))
    writeFileSync(path.join(root, 'packages/ui/src/entry.ts'), 'export const a = 1\n')
    expect(surfacesDigest(root)).not.toBe(before)
  })

  it('ignores what Finder writes, so two machines agree about identical code', () => {
    const root = fixture()
    const before = surfacesDigest(root)
    writeFileSync(path.join(root, 'packages/ui/src/.DS_Store'), 'finder')
    expect(surfacesDigest(root)).toBe(before)
  })

  it('ignores a test file, because a test alters no pixel', () => {
    const root = fixture()
    const before = surfacesDigest(root)
    writeFileSync(path.join(root, 'packages/ui/src/index.test.ts'), 'it("b", () => {})\n')
    expect(surfacesDigest(root)).toBe(before)
  })

  it('ignores a file that is not a surface at all', () => {
    const root = fixture()
    const before = surfacesDigest(root)
    writeFileSync(path.join(root, 'packages/ui/src/notes.md'), '# not a surface\n')
    expect(surfacesDigest(root)).toBe(before)
  })
})
