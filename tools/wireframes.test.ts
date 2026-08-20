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

describe('the extractor knows about every shape the sources use', () => {
  /**
   * `rolesOf` reads source text and reports the shapes it was taught. On
   * 2026-08-20 a renderer moved from `text(doc, 'wipe-failed', …)` to a local
   * helper `note('wipe-failed', …)`, and the role disappeared from SCR-12's
   * wireframe while the screen still emitted it — and `export-failed`, added in
   * the same change, never appeared at all. The generated file went from true to
   * confidently wrong, and the test above stayed green because it compares the
   * file to the extractor rather than either to the screen.
   *
   * So: the roles a component's **own tests** reach for must all be in its
   * wireframe. Two artefacts maintained by different hands for different reasons,
   * and where they disagree one of them is wrong — which is the only kind of
   * check that catches an extractor being taught too little.
   */
  /** Roles emitted by the local modules this source imports, one hop deep. */
  const composedRoles = (source: string): string[] => {
    const text = readFileSync(path.join(root, source), 'utf8')
    const dir = path.dirname(source)
    const roles: string[] = []
    for (const match of text.matchAll(/from '(\.[^']+)\.js'/g)) {
      const target = path.join(dir, `${match[1] as string}.ts`)
      try {
        readFileSync(path.join(root, target), 'utf8')
      } catch {
        continue
      }
      roles.push(...rolesOf(target))
    }
    return roles
  }

  const testFileFor = (source: string): string | null => {
    const candidate = source.replace(/\.ts$/, '.test.ts')
    try {
      return readFileSync(path.join(root, candidate), 'utf8')
    } catch {
      return null
    }
  }

  it('reports every role a screen’s own tests address', () => {
    const missing: string[] = []
    let checked = 0
    for (const [id, screen] of Object.entries(SCREENS)) {
      const tests = testFileFor(screen.source)
      if (!tests) continue
      checked += 1
      /**
       * Roles the tests expect to *find*, which is not every role they name.
       *
       * A test may assert a role is absent — `[data-role=spinner]` in SCR-01 is
       * asserted null, because a bare spinner is what that screen deliberately
       * does not show. Reading those as "the screen has this" would demand a
       * wireframe entry for an element that must not exist.
       *
       * Lines mentioning `toBeNull` are therefore skipped. That is a heuristic on
       * test text, and it errs by **losing** a comparison rather than inventing
       * one: a positive assertion written on the same line as a negative one goes
       * unchecked, and nothing false is asserted.
       */
      const addressed = new Set(
        tests
          .split('\n')
          .filter((line) => !line.includes('toBeNull'))
          .flatMap((line) => [...line.matchAll(/\[data-role=([a-z0-9-]+)\]/g)])
          .map((m) => m[1] as string),
      )
      // One hop through the screen's own local imports: a screen composes
      // components, and their roles are addressable on it. `packages/ui/src/popup`
      // renders the queue, so `[data-role=item]` is reachable there and no amount
      // of reading `popup.ts` will say so.
      const known = new Set([...rolesOf(screen.source), ...composedRoles(screen.source)])
      for (const role of addressed) {
        if (!known.has(role)) missing.push(`${id}: ${role}`)
      }
    }
    // The check must have had something to read, or an empty comparison passes.
    expect(checked, 'no screen source has a test file beside it — the pairing broke').toBeGreaterThan(
      4,
    )
    expect(
      missing,
      'roles the tests click on and the wireframe does not list — the extractor has not been taught this shape',
    ).toEqual([])
  })
})
