import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { SCREENS, rolesOf, wireframe } from './wireframes.mjs'

/**
 * The wireframes are generated, so this test is what makes them true.
 *
 * A screen that gains a control now fails the build until its wireframe is
 * regenerated. Without this the generator would be a one-off script and the
 * files would drift back into fiction within a release — which is what a
 * hand-written wireframe does, only faster.
 */

const root = process.cwd()
const read = (id: string): string =>
  readFileSync(path.join(root, 'docs/ux/wireframes', `${id}.md`), 'utf8')

describe('every screen has a wireframe, and it is current', () => {
  for (const id of Object.keys(SCREENS)) {
    it(`${id} matches what its renderer emits`, () => {
      expect(read(id)).toBe(wireframe(id))
    })
  }
})

describe('the generator reads something real', () => {
  it('finds elements in every screen, so an empty result cannot pass as agreement', () => {
    // Two empty strings compare equal. If the extraction silently returned
    // nothing, every test above would go green on nothing at all.
    for (const [id, screen] of Object.entries(SCREENS)) {
      expect(rolesOf(screen.source).length, `${id} has no addressable elements`).toBeGreaterThan(2)
    }
  })

  it('names the renderer as the authority, not the document', () => {
    expect(read('SCR-06')).toContain('the renderer is right and this file is stale')
  })
})
