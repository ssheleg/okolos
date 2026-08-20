import { readFileSync } from 'node:fs'
import path from 'node:path'

import { globSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Every kind of journal row must have something that writes it.
 *
 * `detector-disabled` had four readers and **no writer**: a slot in the storage schema, a
 * position in the popup's ordering, a default sentence, and a label in the journal panel —
 * for a state the product cannot reach. It came from a design in the m0/m1 spec ("a fuse
 * quenches the detector for the session") that was never built, and never should have
 * been: quenching for the session would turn an ordinary worker restart into a page left
 * unprotected in silence, which is the opposite of what this product promises.
 *
 * Vocabulary for a state that cannot occur is not harmless. It tells the next reader the
 * state exists, and it makes a reader's exhaustive `Record<Kind, …>` look complete while
 * one entry can never be exercised — so nothing ever proves that entry right or wrong.
 *
 * Found 2026-08-20 by checking the spec's failure table against the code, row by row.
 */

const root = path.resolve(import.meta.dirname, '..')

/** The union, read from the store's own schema rather than restated here. */
function kinds(): string[] {
  const schema = readFileSync(path.join(root, 'packages/storage/src/schema.ts'), 'utf8')
  const line = /kind:\s*((?:'[a-z-]+'\s*\|\s*)*'[a-z-]+')/.exec(schema)
  expect(line, 'schema.ts no longer declares the journal kinds in one line').not.toBeNull()
  return [...(line?.[1] ?? '').matchAll(/'([a-z-]+)'/g)].map((m) => m[1] as string)
}

/** Product sources — the places a row could be written from. */
function sources(): string[] {
  return globSync(['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts'], {
    cwd: root,
    exclude: (p) => p.includes('.test.') || p.includes('.bench.') || p.includes('/dist/'),
  }).map((p) => path.join(root, p))
}

describe('a journal kind exists because something writes it', () => {
  it('reads the kinds from the schema, and there are several', () => {
    expect(kinds().length).toBeGreaterThan(2)
  })

  it('has a writer for every kind', () => {
    const text = sources()
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
    const unwritten = kinds().filter((kind) => !text.includes(`kind: '${kind}'`))
    expect(unwritten, 'these kinds are read everywhere and written nowhere').toEqual([])
  })
})
