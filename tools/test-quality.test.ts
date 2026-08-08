import { existsSync, readFileSync, readdirSync } from 'node:fs'
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

/** Files under a directory, found rather than listed. */
function walk(dir: string, keep: (name: string) => boolean, found: string[] = []): string[] {
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const next = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(next, keep, found)
    else if (keep(entry.name)) found.push(next)
  }
  return found
}

const unitTests = (dir: string): string[] => walk(dir, (name) => name.endsWith('.test.ts'))
const productCode = (dir: string): string[] =>
  walk(dir, (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))

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
        // `if (x) return` — the same fault, and it slipped through the rule
        // above until it was written into this very file.
        if (/^if\s*\(.*\)\s*return\s*;?$/.test(line)) {
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

describe('every message type is both served and sent', () => {
  const rpc = readFileSync(path.join(root, 'packages/contracts/src/rpc.ts'), 'utf8')
  const types = [...rpc.matchAll(/^\s*'([a-z/-]+)':\s*\{/gm)].map((m) => m[1] as string)

  const product = [...productCode('apps'), ...productCode('packages')]
    .map((file) => readFileSync(path.join(root, file), 'utf8'))
    .join('\n')

  const sources = [
    'apps/extension/src/background/index.ts',
    'apps/extension/src/offscreen/index.ts',
    'apps/extension/src/content/index.ts',
  ]
    .map((file) => readFileSync(path.join(root, file), 'utf8'))
    .join('\n')

  /**
   * Types whose only sender is a test, named here rather than excused by a
   * loosened rule. `rules/refresh` exists so an end-to-end run can tell the
   * worker to rebuild its blocking rules after seeding a feed — the product
   * itself calls `refreshBlockRules()` directly. A visible exception with a
   * reason is a decision; a weakened assertion is an accident waiting.
   */
  const TEST_FACING = new Set(['rules/refresh'])

  it('found the contract', () => {
    expect(types.length).toBeGreaterThan(10)
  })

  it('every named exception is still a real endpoint', () => {
    // Otherwise the exception list becomes the place dead types go to hide.
    for (const type of TEST_FACING) {
      expect(types, `${type} is excused but not in the contract`).toContain(type)
      expect(sources, `${type} is excused but has no handler`).toContain(`'${type}'`)
    }
  })

  for (const type of types) {
    it(`${type} has a handler`, () => {
      // Four types sat here with neither handler nor caller: a contract entry
      // nobody serves is a promise the product does not keep.
      expect(sources).toContain(`'${type}'`)
    })

    if (!TEST_FACING.has(type)) {
      it(`${type} has a sender`, () => {
        // `download/verdict` had a sender and no listener for a week, so a
        // blocked download was journalled and the user was told nothing.
        //
        // The exception is applied here, where the test is or is not created,
        // rather than as an early return inside it — a test that exists and
        // returns is the shape this very file forbids.
        expect(product).toMatch(new RegExp(`send\\(\\s*'${type.replace('/', '\\/')}'`))
      })
    }
  }
})

describe('retention is not left to an alarm that may never fire', () => {
  /**
   * `alarms.create` replaces an alarm of the same name, the background
   * re-creates it on every service-worker start, and an MV3 worker starts many
   * times a day — so a twenty-four hour alarm on a browser in daily use can be
   * reset before it fires. The journal screen promises that anything older
   * than ninety days is deleted.
   *
   * The decision of *when* is unit-tested in packages/storage. What no unit
   * test can reach is whether the background actually asks at start: the
   * module runs on import and cannot be loaded in isolation. This is a source
   * check, and a source check is weaker than a behavioural one — it would not
   * notice a sweep that ran and did nothing. It is here because deleting the
   * call was otherwise caught by nothing at all.
   */
  const background = readFileSync(
    path.join(root, 'apps/extension/src/background/index.ts'),
    'utf8',
  )

  it('sweeps at start, not only when the alarm fires', () => {
    const atModuleScope = /^void sweepIfDue\(\)$/m.test(background)
    expect(atModuleScope, 'the startup sweep is gone; retention rests on the alarm alone').toBe(
      true,
    )
  })

  it('still sweeps on the alarm, for a session that never restarts', () => {
    const inHandler = /RETENTION_ALARM\)[\s\S]{0,400}sweepIfDue\(\)/.test(background)
    expect(inHandler, 'the alarm no longer sweeps').toBe(true)
  })

  it('records when it swept, or the next start cannot tell', () => {
    expect(background).toContain('LAST_SWEEP_KEY')
    expect(background).toContain('dueForSweep')
  })
})

describe('silence is not an empty list', () => {
  /**
   * `send()` resolves to the handler's answer, and a handler that never ran
   * resolves to nothing. `?? []` on that turns "the background did not answer"
   * into "there is nothing here" — the reassuring answer, and possibly the
   * wrong one.
   *
   * The trusted-domains panel did exactly that, three lines above a comment
   * forbidding it. The surfaces go through `answered()` now, which is unit
   * tested; this stops the shortcut coming back, because no unit test reaches
   * the wiring where it lives.
   *
   * Content-script code is deliberately outside this rule and is listed with
   * its reason: there, an unanswered lookup falls to the cautious side.
   */
  const SURFACES = [
    'apps/extension/src/options/index.ts',
    'apps/extension/src/popup/index.ts',
    'apps/extension/src/first-run/index.ts',
    'apps/extension/src/interstitial/index.ts',
  ]

  it('reads surfaces that exist, so an empty sweep cannot pass', () => {
    const present = SURFACES.filter((file) => existsSync(path.join(root, file)))
    expect(present.length).toBeGreaterThan(2)
  })

  it('no surface defaults an unanswered RPC to an empty list', () => {
    /**
     * Two shapes, and the second is the one the first version of this rule
     * missed. Inline — `(await send(...))?.x ?? []` — is a single line and easy
     * to spot. Assigned first and defaulted later is not, and that is exactly
     * how the trusted-domains panel was written, so the variable is followed.
     */
    const offenders: string[] = []
    for (const file of SURFACES) {
      const full = path.join(root, file)
      if (!existsSync(full)) continue
      const body = readFileSync(full, 'utf8')

      if (/\(\s*(?:await\s+)?[\w.]*send\([^)]*\)\s*\)?\??\.?\w*\s*\?\?\s*[[{]/.test(body)) {
        offenders.push(`${file} (inline)`)
      }

      for (const match of body.matchAll(
        /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?[\w.]*send\(/g,
      )) {
        const name = match[1] as string
        const defaulted = new RegExp(`\\b${name}\\s*\\??\\.[\\w.]+\\s*\\?\\?\\s*[[{]`)
        if (defaulted.test(body.slice(match.index))) offenders.push(`${file} (${name})`)
      }
    }
    expect(
      [...new Set(offenders)],
      'these turn "the background did not answer" into "there is nothing here" — use answered()',
    ).toEqual([])
  })

  it('the helper that makes the distinction is tested where it lives', () => {
    expect(existsSync(path.join(root, 'apps/extension/src/options/answered.test.ts'))).toBe(true)
  })
})
