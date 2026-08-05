import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The shape of a test that passes by doing nothing.
 *
 * `if (state !== 'ready') return` inside a spec reads as caution and behaves as
 * a skip: the assertions below it never run, the run is green, and the report
 * says the scenario passed. The one in `scn-017` would have hidden exactly the
 * regression that screen exists to survive — losing the `management`
 * permission — and it was written by the same hand that has spent this session
 * hunting vacuous greens.
 *
 * The rule is narrow on purpose. A bare `return` inside a spec body abandons
 * the test; a `return <value>` is a helper computing something, which is fine.
 * A branch that genuinely cannot be asserted belongs in a unit test where the
 * condition can be constructed, not in an end-to-end run where it is left to
 * chance.
 */

const root = process.cwd()
const specs = readdirSync(path.join(root, 'e2e')).filter((name) => name.endsWith('.spec.ts'))

describe('no end-to-end test can pass by giving up', () => {
  it('has specs to check at all', () => {
    // Otherwise an empty list would make every assertion below vacuous — the
    // very fault this file exists to catch.
    expect(specs.length).toBeGreaterThan(10)
  })

  for (const name of specs) {
    it(`${name} contains no bare early return`, () => {
      const lines = readFileSync(path.join(root, 'e2e', name), 'utf8').split('\n')
      const offenders = lines
        .map((line, index) => ({ line: line.trim(), number: index + 1 }))
        .filter((entry) => /^if\s*\(.*\)\s*return\s*;?$/.test(entry.line))

      expect(
        offenders,
        `a bare early return skips the assertions after it and still reports green`,
      ).toEqual([])
    })
  }
})
