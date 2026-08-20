import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The ledger that must not need remembering.
 *
 * Its subject is "do not take an assertion for an observation", and its own prose said
 * "two rows of ten" while the table held twelve rows and one `never` — a number carried
 * over from a previous version rather than counted (B-60). A document about measurement
 * that misdescribes itself is the sharpest possible failure of its own rule.
 *
 * So the arithmetic is computed here, the order is checked, and every row is required
 * to say what invalidates it. The last of those is the one that matters most: a row
 * whose truth decays and does not say so reads as permanent.
 */

const root = path.resolve(import.meta.dirname, '..')
const ledger = readFileSync(path.join(root, 'docs/superpowers/verification.md'), 'utf8')

/** One entry per `| V-nn |` row of the table. */
function rows(): Array<{ id: string; cells: string[] }> {
  return [...ledger.matchAll(/^\| (V-\d+) \|(.*)\|$/gm)].map((found) => ({
    id: found[1] as string,
    cells: (found[2] as string).split(' | ').map((cell) => cell.trim()),
  }))
}

describe('the verification ledger describes itself correctly', () => {
  it('has rows to describe, so an empty parse cannot pass', () => {
    // The shape this project keeps planting for: a regex that stops matching turns
    // every assertion below into a statement about nothing.
    expect(rows().length).toBeGreaterThan(5)
  })

  it('states a row count that matches the table', () => {
    const counted = rows().length
    const words: Record<number, string> = {
      10: 'десяти',
      11: 'одиннадцати',
      12: 'двенадцати',
      13: 'тринадцати',
      14: 'четырнадцати',
      15: 'пятнадцати',
    }
    const spelled = words[counted]
    expect(spelled, `no Russian word recorded for ${counted} rows`).toBeDefined()
    // The prose names the count once, in the sentence about `never`. Any other number
    // in that position is the defect this file exists for.
    expect(
      ledger,
      `the table has ${counted} rows and the prose does not say "${spelled ?? '?'}"`,
    ).toContain(`из ${spelled}`)
  })

  it('states a `never` count that matches the table', () => {
    const never = rows().filter((row) => row.cells.some((cell) => cell.includes('`never`')))
    // Singular is the only case the prose currently spells; a second `never` has to be
    // written about rather than absorbed into a sentence that says "one".
    expect(never.length, 'more than one `never` — the prose says "один ряд"').toBe(1)
    expect(never[0]?.id).toBe('V-09')
  })

  it('keeps the rows in order, because a reader scans by number', () => {
    // V-10 sat after V-12 for a week. Nothing was wrong with the row; the table was
    // simply not a list any more.
    const ids = rows().map((row) => Number(row.id.slice(2)))
    expect(ids).toEqual([...ids].sort((a, b) => a - b))
  })

  it('makes every row say what invalidates it', () => {
    /**
     * The column that replaced a date. A calendar figure would be an invented number in
     * a document about measurement — nobody knows whether an observation spoils in
     * thirty days or in one — so each row names the thing that spoils it: a constant in
     * the code, the next deploy, a file changing, or nothing at all for the row that is
     * `never` by decision.
     */
    for (const row of rows()) {
      const last = row.cells[row.cells.length - 1] ?? ''
      expect(last.length, `${row.id} does not say what invalidates it`).toBeGreaterThan(20)
    }
  })

  it('names the tool behind a row that claims a production run', () => {
    // "Observed on production" with nothing to re-run it is a memory, not a check.
    for (const row of rows()) {
      const line = row.cells.join(' | ')
      if (!line.includes('на проде')) continue
      expect(line, `${row.id} claims a production run and names no tool`).toMatch(
        /`tools\/[\w.-]+`/,
      )
    }
  })
})

describe('a row that states a number states the one that is true today', () => {
  /**
   * V-07 said "nine screens pass axe — 8 areas + popup, interstitial, first run", which
   * does not add up to nine and was not what the file ran: the recovery area had a sweep
   * of its own, outside the list, so the count was stale in one direction and the
   * arithmetic wrong in the other (B-59).
   *
   * A number in a ledger about measurement is the last place a remembered figure belongs.
   * This one is counted from the spec that produces it — the `AREAS` list plus the tests
   * standing on their own — the same way `facts.md` numbers are computed rather than
   * restated.
   */
  const spec = readFileSync(path.join(root, 'e2e/a11y.spec.ts'), 'utf8')

  const surfaces = (): { areas: number; standalone: number } => {
    const list = /const AREAS = \[([\s\S]*?)\n\] as const/.exec(spec)
    const areas = [...(list?.[1] ?? '').matchAll(/\{ hash:/g)].length
    const standalone = [
      ...spec.matchAll(/^test\('the .* has no detectable accessibility violations'/gm),
    ].length
    return { areas, standalone }
  }

  it('parses the spec at all, so an empty count cannot agree with anything', () => {
    // The failure this guards is the one the ledger is about: a regex that stops matching
    // answers "zero", and zero would quietly equal a ledger that had also lost its number.
    const { areas, standalone } = surfaces()
    expect(areas, 'the AREAS list did not parse').toBeGreaterThan(5)
    expect(standalone, 'the standalone axe tests did not parse').toBeGreaterThan(1)
  })

  it('states the number of surfaces the sweep actually covers', () => {
    const { areas, standalone } = surfaces()
    const row = rows().find((entry) => entry.id === 'V-07')
    expect(row, 'V-07 is gone from the ledger').toBeDefined()
    const claim = row?.cells.join(' ') ?? ''

    /**
     * Both halves: the total and the breakdown that has to add up to it.
     *
     * The claim column spells its number as a word, which is how every row here reads;
     * the digit lives in the evidence beside it, where a reader checking arithmetic
     * looks. Requiring the digit somewhere in the row is what makes the arithmetic
     * checkable at all — "девять … 8 + три" survived a fortnight of reading.
     */
    expect(claim, `the sweep covers ${areas + standalone} surfaces`).toContain(
      `${areas + standalone} поверхностей`,
    )
    expect(claim, `${areas} of them are options areas`).toContain(`${areas} областей`)
  })
})
