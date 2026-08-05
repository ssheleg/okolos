import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The shapes a test takes when it stops testing.
 *
 * Two of them, both written in this repository and both found by sweeping for
 * the pattern rather than by anything failing.
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

/** Every unit test in the repository, found rather than listed. */
function unitTests(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const next = path.join(dir, entry.name)
    if (entry.isDirectory()) unitTests(next, found)
    else if (entry.name.endsWith('.test.ts')) found.push(next)
  }
  return found
}

const units = [...unitTests('packages'), ...unitTests('apps'), ...unitTests('tools')]

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

describe('no unit test hides its assertions behind a branch', () => {
  it('found the unit tests to check', () => {
    expect(units.length).toBeGreaterThan(40)
  })

  for (const file of units) {
    it(`${file} asserts unconditionally`, () => {
      const lines = readFileSync(path.join(root, file), 'utf8').split('\n')
      const offenders: string[] = []

      lines.forEach((raw, index) => {
        const line = raw.trim()
        // `if (x) expect(...)` — the assertion vanishes when x is false.
        if (/^if\s*\(.*\)\s*expect\(/.test(line)) {
          offenders.push(`${index + 1}: ${line}`)
          return
        }
        // `if (x) {` opening a block whose first statement is an assertion.
        // A narrowing helper that throws is the fix; this is the pattern it
        // replaces.
        if (/^if\s*\(.*\)\s*\{$/.test(line)) {
          const next = lines.slice(index + 1).find((candidate) => candidate.trim() !== '')
          if (next && /^expect\(/.test(next.trim())) offenders.push(`${index + 1}: ${line}`)
        }
      })

      expect(
        offenders,
        'an assertion inside a branch does not run when the branch is not taken, and the test passes anyway',
      ).toEqual([])
    })
  }
})
