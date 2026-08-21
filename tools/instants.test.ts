import { readFileSync, globSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * A stored instant reaches a person through one module, and only through it.
 *
 * There were three private copies of the same two-line formatter and one screen with none.
 * On 2026-08-21 the copies were consolidated into `packages/ui/src/when.ts` — and the sweep
 * that did it looked for *copies of the function*, so it could not see the two sites that
 * had no formatter to copy: `journal/journal.ts` kept a fourth copy under a name the grep
 * did not match, and `self-audit/panel.ts` printed `entry.createdAt` raw, putting
 * `2026-08-20T23:51:17.931Z` on the screen that carries the product's central claim.
 *
 * So the check is written twice over, because the two failures do not look alike:
 *
 *  - **the second copy** — a formatter outside `when.ts` is a divergence waiting to happen,
 *    and it is found by matching the transformation, not the function name;
 *  - **the missing call** — a renderer that hands a stored timestamp straight to the DOM,
 *    found by matching the field names the stores actually use.
 *
 * The lesson the second half encodes: a sweep for a defect's *shape* misses every site
 * where the defect is an absence. Ask what identifies the defect, then run that query.
 */

const root = path.resolve(import.meta.dirname, '..')
const WHEN = 'packages/ui/src/when.ts'

/** Product sources, tests excluded: a test may hold whatever string it is asserting. */
function sources(): string[] {
  return globSync(['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts'], {
    cwd: root,
    exclude: (p) => p.includes('.test.') || p.includes('.bench.') || p.includes('/dist/'),
  })
}

/**
 * Files that put text in front of a person.
 *
 * The distinction is not decoration: `.slice(0, 10)` in the background is a **storage key**
 * — the reuse index and the "seen this host" note both keep ten characters on purpose, and
 * `when.ts` says so in its own comment. The first version of this gate flagged all four of
 * those and would have pushed a rendering rule into the storage layer. What makes a
 * formatter a second copy is that its output is read by someone.
 */
function draws(text: string): boolean {
  return /textContent|createElement|innerHTML|notifications\.create/.test(text)
}

describe('one module renders a stored instant', () => {
  it('holds no second copy of the formatter', () => {
    const offenders: string[] = []
    for (const file of sources()) {
      if (file === WHEN) continue
      const text = readFileSync(path.join(root, file), 'utf8')
      if (!draws(text)) continue
      // The transformation, not the name: `replace('T', ' ')` and a slice to ten
      // characters are what the copies had in common, whatever each was called.
      if (/replace\(\s*'T'\s*,\s*' '\s*\)/.test(text)) offenders.push(`${file}: builds " UTC" itself`)
      if (/\.slice\(0,\s*10\)/.test(text) && !text.includes('shortDate'))
        offenders.push(`${file}: slices a date out of an ISO string`)
    }
    expect(
      offenders,
      `import shortTime/shortDate from ${WHEN} instead — four copies of two lines is how two screens came to disagree about the same instant`,
    ).toEqual([])
  })

  it('is looking at real files, so an empty walk cannot pass', () => {
    expect(sources().length).toBeGreaterThan(100)
    expect(readFileSync(path.join(root, WHEN), 'utf8')).toContain('export function shortTime')
  })

  /**
   * The other half of this class is checked where the text exists, not here.
   *
   * A third case lived in this file for ten minutes: a pattern for a stored field handed
   * straight to the DOM. Planting the original defect back — `text(doc, 'entry-time',
   * entry.createdAt)` — proved it passed, because this codebase's renderers pass strings as
   * *arguments* to a `text(doc, role, content)` helper rather than assigning `textContent`.
   * A gate that misses the case it was written for is worse than no gate: it certifies the
   * class as covered.
   *
   * So the missing-call half is behavioural and lives in `e2e/rendered-instants.spec.ts`,
   * which reads what the built pages actually show. Textual gates catch a shape; only
   * rendered text catches an absence.
   */
})
