/**
 * A decision record that names no mechanism is a note.
 *
 * These exist because the reasoning behind seven decisions lived in the middle
 * of audit prose, where it is findable only by someone who already knows it is
 * there. Moving it out is worth doing once; keeping it true is worth gating,
 * because a record that outlives the thing holding it up is worse than no
 * record — it tells the next person the property is guaranteed.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { filesIn } from './tree.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'docs/adr')
// `filesIn` rather than `readdirSync`: the suffix is the point, and the numbered
// prefix is this gate's own rule on top of it (B-58).
const records = filesIn(dir, '.md')
  .filter((f) => /^\d{4}-/.test(f))
  .sort()

describe('every decision record', () => {
  it('exists in more than name — there are records to check', () => {
    expect(records.length).toBeGreaterThanOrEqual(5)
  })

  for (const file of records) {
    const text = readFileSync(path.join(dir, file), 'utf8')

    it(`${file} says what holds it up`, () => {
      expect(text, 'no "Чем держится" section').toMatch(/## Чем держится/)
    })

    it(`${file} names the cost of the decision`, () => {
      // A record with no cost is an advertisement. Every one of these has a
      // price and the price is the useful half.
      expect(text, 'no "Цена" section').toMatch(/## Цена/)
    })

    it(`${file} cites files that exist`, () => {
      /**
       * The whole point. A record can name a gate that was deleted, and it will
       * keep reading as a guarantee — which is how a property nobody enforces
       * ends up believed.
       */
      const cited = [...text.matchAll(/`((?:tools|packages|apps|docs|corpora)\/[\w./-]+)`/g)].map(
        (m) => m[1] as string,
      )
      expect(cited.length, `${file} cites no file at all`).toBeGreaterThan(0)
      for (const cite of cited) {
        expect(existsSync(path.join(root, cite)), `${file} cites ${cite}, which is not there`).toBe(
          true,
        )
      }
    })
  }

  it('is listed in the index, and the index lists nothing else', () => {
    const index = readFileSync(path.join(dir, 'README.md'), 'utf8')
    for (const file of records) {
      expect(index, `${file} is not in the index`).toContain(file)
    }
    for (const [, linked] of index.matchAll(/\]\((\d{4}-[\w-]+\.md)\)/g)) {
      expect(records, `the index links ${linked}, which is not there`).toContain(linked)
    }
  })
})
