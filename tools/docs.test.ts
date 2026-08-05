import { readdirSync, readFileSync } from 'node:fs'
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
