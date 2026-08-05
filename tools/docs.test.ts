import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

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
