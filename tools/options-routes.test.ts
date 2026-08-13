import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { ALL_VIEWS, hashFor, routeFor } from '../apps/extension/src/options/views.js'

/**
 * Every address this extension produces is one the options page resolves.
 *
 * The defect this gate exists for was not a bug in either half. The popup
 * produced `options.html#journal` from two call sites; the page's table held
 * `#queue` and nothing else; and `onOpen('settings')` fell into an `else`
 * branch that dropped the fragment entirely, so the settings link opened the
 * self-audit panel. Every piece was locally reasonable. Nothing compared them.
 *
 * So this gate compares them, and it does it twice over: here against the
 * source, where a mistake is written, and in `gates/bundle-scan.test.ts`
 * against the built bundle, because a promise about runtime belongs against the
 * artefact that runs.
 */

const root = process.cwd()

const sources = globSync('apps/extension/src/**/*.ts', { cwd: root })
  .filter((p) => !p.endsWith('.test.ts'))
  // The table itself spells addresses; that is its job.
  .filter((p) => !p.endsWith('options/views.ts'))
  .map((p) => path.join(root, p))

/** Every `options.html#…` literal, wherever it is written. */
const ADDRESS = /options\.html(#[^'"`\s)]*)/g

/**
 * Comments are mentions, not uses.
 *
 * `interstitial/appeal-link.ts` documents the address it used to open —
 * `options.html#appeal`, which matched nothing — and that sentence is the
 * reason the file is the way it is. A gate that reads it as a producer would
 * force the project to delete its own evidence to stay green.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

function addressesIn(file: string): string[] {
  return [...code(readFileSync(file, 'utf8')).matchAll(ADDRESS)].map((m) => m[1] as string)
}

describe('every address the extension produces, the page resolves', () => {
  it('finds sources to check — an empty sweep would prove nothing', () => {
    expect(sources.length).toBeGreaterThan(5)
  })

  for (const file of sources) {
    const found = addressesIn(file)
    if (found.length === 0) continue
    it(`${path.relative(root, file)} spells only addresses that resolve`, () => {
      for (const hash of found) {
        const route = routeFor(hash)
        expect(
          route.unrecognised,
          `${path.relative(root, file)} opens ${hash}, which the options page does not recognise`,
        ).toBeUndefined()
      }
    })
  }

  it('nobody spells an address by hand — they come from optionsPageFor', () => {
    // A resolving literal is still a literal: it drifts the moment the table
    // changes. The helper is the only spelling allowed, so the two halves
    // cannot come apart again.
    const handwritten = sources
      .filter((file) => addressesIn(file).length > 0)
      .map((file) => path.relative(root, file))
    expect(handwritten, 'use optionsPageFor(view) instead of writing the address').toEqual([])
  })
})

describe('the table answers for every area', () => {
  it('resolves each area back to itself', () => {
    for (const view of ALL_VIEWS) {
      const hash = view === 'recovery' ? hashFor(view, 'entered-password') : hashFor(view)
      const route = routeFor(hash)
      expect(route.view, view).toBe(view)
      expect(route.unrecognised, view).toBeUndefined()
    }
  })

  it('names an address it does not know rather than swallowing it', () => {
    // The whole failure mode in one assertion: an address that resolves to
    // nothing must arrive somewhere *and say so*. A silent fallback to the
    // overview is indistinguishable from the address having worked.
    const route = routeFor('#settings')
    expect(route.view).toBe('overview')
    expect(route.unrecognised).toBe('#settings')
  })
})
