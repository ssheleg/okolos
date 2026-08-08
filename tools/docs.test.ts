import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { SCREENS } from './wireframes.mjs'

/**
 * The navigation layer, held to the same standard as the code.
 *
 * `docs/README.md` is the first file anyone opens, and it had been describing a
 * project at pipeline stage 2 with "the skeleton in progress" long after the
 * skeleton was thirty-seven requirements and three applications. Nothing broke;
 * it simply misled every reader at the moment they most needed orientation.
 *
 * Only falsifiable claims are asserted here. "Phase" is a judgement and stays a
 * judgement; a package that exists and is not on the map is a fact.
 */

const root = process.cwd()
const readme = readFileSync(path.join(root, 'docs/README.md'), 'utf8')
const brief = readFileSync(
  path.join(root, 'docs/superpowers/briefs/2026-08-04-okolos-p0-p5.md'),
  'utf8',
)

const members = (dir: string): string[] =>
  readdirSync(path.join(root, dir), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

describe('the map covers the territory', () => {
  it('names every package', () => {
    for (const name of members('packages')) {
      expect(readme, `packages/${name} is not on the map`).toContain(`\`${name}\``)
    }
  })

  it('names every application', () => {
    for (const name of members('apps')) {
      expect(readme, `apps/${name} is not on the map`).toContain(`\`apps/${name}\``)
    }
  })

  it('counts them correctly', () => {
    expect(readme).toContain(`${members('packages').length} пакетов`)
    expect(readme).toContain(`${members('apps').length} приложения`)
  })
})

describe('the numbers agree with the ledger they summarise', () => {
  it('states the requirement total the brief actually has', () => {
    const total = [...brief.matchAll(/^\| REQ-\d+ \|/gm)].length
    expect(readme).toContain(`Требования | ${total}:`)
  })

  it('states how many are partial, counted rather than remembered', () => {
    const partial = [...brief.matchAll(/^\| REQ-\d+ \|.*PARTIAL/gm)].length
    expect(readme).toContain(`${partial} PARTIAL`)
  })
})

describe('the module map names modules that exist', () => {
  const map = readFileSync(path.join(root, 'docs/superpowers/module-map.md'), 'utf8')

  it('has no ghost packages', () => {
    // It named `core-url`, `core-page` and `playbooks` for a week. A plan that
    // survives into a map becomes a map of a product nobody built.
    const packages = new Set(members('packages'))
    for (const name of new Set([...map.matchAll(/`(core-[a-z-]+)`/g)].map((m) => m[1] as string))) {
      expect(packages.has(name), `module-map names ${name}, which is not a package`).toBe(true)
    }
  })

  it('has no ghost UI surfaces', () => {
    const surfaces = new Set(members('packages/ui/src'))
    for (const name of new Set([...map.matchAll(/`ui\/([a-z-]+)`/g)].map((m) => m[1] as string))) {
      expect(surfaces.has(name), `module-map names ui/${name}, which is not a surface`).toBe(true)
    }
  })
})

describe('the coverage matrix claims only what shipped', () => {
  const matrix = readFileSync(path.join(root, 'docs/coverage-matrix.md'), 'utf8')
  const brief = readFileSync(
    path.join(root, 'docs/superpowers/briefs/2026-08-04-okolos-p0-p5.md'),
    'utf8',
  )

  it('backs every tick with a requirement the ledger calls done', () => {
    // A promise sheet written before implementation is a fine thing to have,
    // and a dangerous thing to leave unmarked: a reader takes every row as a
    // capability. The tick is the difference, so the tick has to be earned.
    for (const [, row, claim] of matrix.matchAll(
      /^\| ([0-9]+\.[0-9]+) \|.*\*\*✓\*\* ([^|]+)\|$/gm,
    )) {
      for (const [, req] of (claim as string).matchAll(/REQ-(\d+)/g)) {
        const line = new RegExp(`^\\| REQ-${req} \\|.*$`, 'm').exec(brief)?.[0] ?? ''
        expect(line, `row ${row} cites REQ-${req}`).toMatch(/DONE|PARTIAL/)
      }
    }
  })

  it('cites only specs that exist', () => {
    for (const [, row, claim] of matrix.matchAll(
      /^\| ([0-9]+\.[0-9]+) \|.*\*\*✓\*\* ([^|]+)\|$/gm,
    )) {
      for (const [, spec] of (claim as string).matchAll(/(e2e\/[a-z0-9-]+)/g)) {
        expect(
          existsSync(path.join(root, `${spec}.spec.ts`)),
          `row ${row} cites ${spec}.spec.ts, which is not there`,
        ).toBe(true)
      }
    }
  })

  it('says outright that an unmarked row is not a capability', () => {
    expect(matrix).toMatch(/строка без отметки — намерение/i)
  })
})

describe('a screen record names the controls its renderer draws', () => {
  /**
   * A quoted string in a record's Elements line means "this screen has a
   * control with this label". Anything else — a description, a reference to a
   * control on another screen — goes unquoted, because that is the only rule
   * this check can rely on.
   *
   * Comparison is normalised for case and punctuation, and a renderer label may
   * extend the record's: "Show all" matches "Show all (12 more)". What it will
   * not do is match a different control.
   *
   * Six records and renderers disagreed when this was written. All six were
   * harmless in themselves — "Wipe all data" against a button reading "Delete
   * all data" — and that is the point: they were noise, and the same twelve-line
   * report had been hiding two unwritten buttons and an unreachable module.
   */
  const screens = readFileSync(path.join(root, 'docs/ux/screens.md'), 'utf8')
  // From the generator itself, not a sidecar it writes: a JSON file under
  // graphify-out is absent on a fresh clone and stale everywhere else.
  const sources: Record<string, { source: string }> = SCREENS

  const normalise = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '')

  it('knows about every screen', () => {
    expect(Object.keys(sources).length).toBe(14)
  })

  for (const [id, meta] of Object.entries(sources)) {
    it(`${id} draws every control it names`, () => {
      const block = screens.split(`### ${id}:`)[1]?.split('\n### SCR-')[0] ?? ''
      const elements = /- \*\*Elements:\*\*\s*(.+)/.exec(block)?.[1] ?? ''
      expect(elements, `${id} has no Elements line`).not.toBe('')

      // A renderer may compose its copy from a module it imports — the leaks
      // panel takes its group headings from `core-leaks`. Following the
      // workspace imports one level keeps the check honest without pretending
      // every string lives in one file.
      const renderer = readFileSync(path.join(root, meta.source), 'utf8')
      const imported = [...renderer.matchAll(/from '(@okolos\/[a-z-]+)'/g)]
        .map((m) => `packages/${(m[1] as string).replace('@okolos/', '')}/src`)
        .flatMap((dir) => {
          try {
            return readdirSync(path.join(root, dir))
              .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
              .map((name) => readFileSync(path.join(root, dir, name), 'utf8'))
          } catch {
            return []
          }
        })

      // Two kinds of renderer live in this repo. A DOM renderer names its copy
      // in string literals; a server-rendered screen writes it as markup inside
      // a template literal, where the label is a text node between tags. Read
      // only the first and a screen that ships as HTML looks like a screen that
      // draws nothing.
      const literals = [renderer, ...imported]
        .flatMap((text) => [
          ...text.matchAll(/'([^'\n]{2,60})'/g),
          ...text.matchAll(/>([^<>{}`\n]{2,60})</g),
        ])
        .map((m) => normalise(m[1] as string))

      for (const [, label] of elements.matchAll(/"([^"]{2,40})"/g)) {
        const wanted = normalise(label as string)
        expect(
          literals.some((literal) => literal === wanted || literal.startsWith(wanted)),
          `${id} names a control "${label}" that ${meta.source} does not draw`,
        ).toBe(true)
      }
    })
  }
})

describe('every citation names something that exists', () => {
  /**
   * Coverage lines used to cite `file:line`. Twenty-nine of a hundred and seven
   * had rotted — pointing at a blank line, a closing brace, the middle of a
   * comment — because a line number is a coordinate into a moving target and
   * nothing checked them.
   *
   * They cite a symbol now, or the file alone where the whole file is the
   * evidence. A symbol survives the code moving; when it is renamed away, this
   * fails, which is the point.
   */
  const docs = [
    'docs/ux/scenarios.md',
    'docs/ux/screens.md',
    'docs/superpowers/audits/2026-08-05-acceptance.md',
  ]

  const citation = /\b((?:packages|apps|tools|e2e|docs)\/[\w./-]+\.(?:ts|mjs|py|md))(?::([A-Za-z_$][\w$]*))?/g

  /**
   * Only lines that claim evidence. A path can appear in prose for other
   * reasons — the design-system block names a `tokens.ts` it calls "planned",
   * and a plan is allowed to describe a file that does not exist yet.
   */
  const claims = (doc: string): string[] =>
    readFileSync(path.join(root, doc), 'utf8')
      .split('\n')
      .filter((line) => /\*\*Coverage:\*\*|^\| `/.test(line))
      .filter((line) => !/\bplanned\b/.test(line))

  it('finds citations to check', () => {
    // An empty sweep would make every assertion below vacuous.
    const found = docs.flatMap((doc) => claims(doc).flatMap((line) => [...line.matchAll(citation)]))
    expect(found.length).toBeGreaterThan(50)
  })

  for (const doc of docs) {
    it(`${doc} cites only files that exist`, () => {
      for (const line of claims(doc)) {
        for (const [, file] of line.matchAll(citation)) {
          expect(existsSync(path.join(root, file as string)), `${doc} cites ${file}`).toBe(true)
        }
      }
    })

    it(`${doc} cites only symbols its files define`, () => {
      for (const line of claims(doc)) {
        for (const [, file, symbol] of line.matchAll(citation)) {
          if (!symbol) continue
          const source = readFileSync(path.join(root, file as string), 'utf8')
          expect(
            new RegExp(`\\b${symbol}\\b`).test(source),
            `${doc} cites ${file}:${symbol}, which that file does not define`,
          ).toBe(true)
        }
      }
    })

    it(`${doc} has no line-number citations left`, () => {
      // A line number is a coordinate into a moving target; it rots silently.
      const text = readFileSync(path.join(root, doc), 'utf8')
      const numeric = [...text.matchAll(/\b(?:packages|apps|tools|e2e|docs)\/[\w./-]+\.(?:ts|mjs|py|md):(\d+)/g)]
      expect(numeric.map((m) => m[0])).toEqual([])
    })
  }
})

describe('the standing instructions list is complete', () => {
  /**
   * Instructions 7, 8 and 9 were written into retro entries and never added to
   * the list at the top. A reader following the list got six of nine — and the
   * list is what stage 0 of every run reads.
   */
  const retro = readFileSync(path.join(root, 'docs/superpowers/retro.md'), 'utf8')
  const listed = new Set(
    [...retro.matchAll(/^(\d+)\.\s+\*\*/gm)].map((m) => Number(m[1])),
  )
  const referenced = new Set(
    [...retro.matchAll(/[Ss]tanding instruction \(?(\d+)\)?/g)].map((m) => Number(m[1])),
  )

  it('has a list to check', () => {
    expect(listed.size).toBeGreaterThan(5)
  })

  it('lists every instruction an entry refers to', () => {
    for (const n of referenced) {
      expect(listed.has(n), `an entry cites standing instruction ${n}, which the list omits`).toBe(
        true,
      )
    }
  })

  it('is numbered without gaps', () => {
    // A gap means one was deleted and the rest not renumbered, so a citation
    // now points at the wrong rule.
    const sorted = [...listed].sort((a, b) => a - b)
    expect(sorted).toEqual(sorted.map((_, index) => index + 1))
  })
})

describe('documents do not carry counts that are stale by the next commit', () => {
  it('states how to measure the test totals rather than writing them down', () => {
    // docs/README.md said 703 unit and 55 e2e when the suite was at 932 and 63.
    // The structural counts — packages, requirements, scenarios — are gated
    // above and stay; the volatile ones are a command now.
    const readme = readFileSync(path.join(root, 'docs/README.md'), 'utf8')
    expect(readme).not.toMatch(/\d{3,} unit/)
    expect(readme).toContain('pnpm test')
  })
})
