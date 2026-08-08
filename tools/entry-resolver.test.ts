/**
 * An entry point that reaches `t()` must install a resolver.
 *
 * This gate exists because the defect happened, and every unit test was green
 * while it did. The content script mounts the banner, the inspector and the
 * agent gate; all three ask the catalogue for their words; nothing in that
 * entry ever called `useResolver`. On a real page every label rendered as
 * `[bannerActionInjection]`.
 *
 * The unit tests could not see it — they install a resolver themselves, which
 * is right for a unit test and exactly why the suite spoke Russian while the
 * product spoke identifiers. The browser found it. A gate is cheaper than a
 * browser.
 *
 * The rule is one-directional on purpose. Reaching `t()` obliges an entry to
 * install a resolver; installing one without reaching `t()` is harmless and
 * not worth a failure.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { entryPoints, reachableFrom, root } from './imports.mjs'

/** Entries are files the build ships; HTML pages resolve to the module they load. */
const entries = entryPoints().filter((file: string) => file.endsWith('.ts'))

const asks = (file: string): boolean => /\bt\(\s*'[a-zA-Z0-9_.]+'/.test(readFileSync(file, 'utf8'))
/**
 * A call, not a declaration.
 *
 * The first version of this asked whether `useResolver(` appeared anywhere in
 * the reachable graph. `packages/i18n/src/index.ts` declares the function, and
 * every localised entry reaches it — so the gate was green with the resolver
 * deleted from the content script, which is the one defect it was written to
 * catch. Found by planting it.
 */
const installs = (file: string): boolean =>
  /(?<!function\s)\buseResolver\s*\(/.test(readFileSync(file, 'utf8'))

/** Which entries reach a module that asks the catalogue for a word. */
const localised = entries.filter((entry: string) =>
  [...reachableFrom([entry])].some((file) => asks(file)),
)

describe('every entry that shows a message installs a resolver', () => {
  it('found entry points and a localised surface among them', () => {
    // Two empty sets agree. Without this the gate passes loudest when the
    // extraction breaks — which is the failure mode it is meant to prevent.
    expect(entries.length).toBeGreaterThanOrEqual(3)
    expect(localised.length).toBeGreaterThanOrEqual(2)
  })

  it('leaves no entry speaking in identifiers', () => {
    const silent = localised
      .filter((entry: string) => ![...reachableFrom([entry])].some((file) => installs(file)))
      .map((entry: string) => path.relative(root, entry))
    expect(
      silent,
      'these entries reach t() and never call useResolver — every label renders as [key]',
    ).toEqual([])
  })
})
